import { z } from "zod";
import { MIN_EVIDENCE_QUESTIONS, MIN_UNANSWERABLE } from "../lib/evidence";
import { aggregate } from "./metrics";
import { Metrics, type GenerationRun, type QuestionSet, type RetrievalRun } from "./schema";

// The regression gate (T40). evals/baseline.json is the committed reference: changed only on
// purpose, in its own commit, with the reason. A run fails the gate when a headline metric drops
// more than 2 points (0.02) below the baseline for the same config, or when it was scored on a
// different question set — comparing across sets would be comparing nothing.

export const GATE_POINTS = 0.02;
const EPS = 1e-9;

export const RETRIEVAL_HEADLINES = ["recallAt5", "mrr"] as const;

export const Baseline = z.object({
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  gitSha: z.string().min(1),
  questionsHash: z.string().length(64),
  retrieval: z.record(
    z.string(),
    z.object({ runFile: z.string().min(1), metrics: Metrics, perQuestion: z.record(z.string(), Metrics) }),
  ),
  generation: z
    .object({
      runFile: z.string().min(1),
      config: z.string().min(1),
      hallucinatedCitations: z.number().int().nonnegative(),
      correctRefusalRate: z.number().min(0).max(1).nullable(),
      falseRefusalRate: z.number().min(0).max(1).nullable(),
    })
    .nullable(),
});
export type Baseline = z.infer<typeof Baseline>;

export type Check = { metric: string; baseline: number | null; run: number | null; pass: boolean; note?: string };
export type Verdict = { pass: boolean; checks: Check[] };

const verdict = (checks: Check[]): Verdict => ({ pass: checks.every((c) => c.pass), checks });
const sameSet = (runHash: string, baseline: Baseline): Check => ({
  metric: "question set",
  baseline: null,
  run: null,
  pass: runHash === baseline.questionsHash,
  note: runHash === baseline.questionsHash ? undefined : "scored on a different question set than the baseline; regenerate the baseline on purpose, in its own commit",
});
/** Higher is better: fails below baseline − 2 points. */
const atLeast = (metric: string, base: number, value: number): Check => ({ metric, baseline: base, run: value, pass: value >= base - GATE_POINTS - EPS });
/** Lower is better: fails above baseline + 2 points. */
const atMost = (metric: string, base: number, value: number): Check => ({ metric, baseline: base, run: value, pass: value <= base + GATE_POINTS + EPS });

export function gateRetrieval(run: RetrievalRun, baseline: Baseline): Verdict {
  const base = baseline.retrieval[run.config.name];
  const checks = [sameSet(run.questionsHash, baseline)];
  if (!base) return verdict([...checks, { metric: "baseline", baseline: null, run: null, pass: false, note: `no baseline for config ${run.config.name}` }]);
  return verdict([...checks, ...RETRIEVAL_HEADLINES.map((m) => atLeast(m, base.metrics[m], run.metrics[m]))]);
}

/** The smoke subset against the baseline's own scores for the same questions. `fullHash` is the whole current set's. */
export function gateSmoke(run: RetrievalRun, baseline: Baseline, fullHash: string): Verdict {
  const base = baseline.retrieval[run.config.name];
  const checks = [sameSet(fullHash, baseline)];
  if (!base) return verdict([...checks, { metric: "baseline", baseline: null, run: null, pass: false, note: `no baseline for config ${run.config.name}` }]);
  const missing = run.perQuestion.filter((q) => !base.perQuestion[q.id]).map((q) => q.id);
  if (missing.length) return verdict([...checks, { metric: "baseline", baseline: null, run: null, pass: false, note: `no baseline scores for ${missing.join(", ")}` }]);
  const expected = aggregate(run.perQuestion.map((q) => base.perQuestion[q.id]));
  return verdict([...checks, ...RETRIEVAL_HEADLINES.map((m) => atLeast(m, expected[m], run.metrics[m]))]);
}

export function gateGeneration(run: GenerationRun, baseline: Baseline): Verdict {
  const checks: Check[] = [sameSet(run.questionsHash, baseline)];
  // Hallucinated citations must be 0, whatever the baseline says.
  checks.push({ metric: "hallucinatedCitations", baseline: 0, run: run.metrics.hallucinatedCitations, pass: run.metrics.hallucinatedCitations === 0 });
  const base = baseline.generation;
  if (!base) return verdict([...checks, { metric: "baseline", baseline: null, run: null, pass: false, note: "no generation baseline" }]);
  const m = run.metrics;
  if (base.correctRefusalRate !== null && m.correctRefusalRate !== null) checks.push(atLeast("correctRefusalRate", base.correctRefusalRate, m.correctRefusalRate));
  if (base.falseRefusalRate !== null && m.falseRefusalRate !== null) checks.push(atMost("falseRefusalRate", base.falseRefusalRate, m.falseRefusalRate));
  return verdict(checks);
}

/** The baseline from full-set runs only (the same rule as the README evidence). */
export function buildBaseline(
  retrieval: { file: string; run: RetrievalRun }[],
  generation: { file: string; run: GenerationRun } | null,
  questionsHash: string,
  gitSha: string,
  date = new Date(),
): Baseline {
  const out: Baseline["retrieval"] = {};
  for (const { file, run } of retrieval) {
    if (run.questionsHash !== questionsHash) throw new Error(`${file} was scored on a different question set`);
    if (run.questionCount < MIN_EVIDENCE_QUESTIONS) throw new Error(`${file} covers ${run.questionCount} questions; a baseline needs ${MIN_EVIDENCE_QUESTIONS}`);
    if (out[run.config.name]) throw new Error(`Two runs for config ${run.config.name}`);
    out[run.config.name] = { runFile: file, metrics: run.metrics, perQuestion: Object.fromEntries(run.perQuestion.map((q) => [q.id, q.metrics])) };
  }
  if (Object.keys(out).length === 0) throw new Error("A baseline needs at least one retrieval run");
  if (generation) {
    const g = generation.run;
    if (g.questionsHash !== questionsHash) throw new Error(`${generation.file} was scored on a different question set`);
    if (g.answerableCount < MIN_EVIDENCE_QUESTIONS || g.unanswerableCount < MIN_UNANSWERABLE) {
      throw new Error(`${generation.file} needs ${MIN_EVIDENCE_QUESTIONS} answerable and ${MIN_UNANSWERABLE} unanswerable questions`);
    }
  }
  return Baseline.parse({
    version: 1,
    createdAt: date.toISOString(),
    gitSha,
    questionsHash,
    retrieval: out,
    generation: generation && {
      runFile: generation.file,
      config: generation.run.config.name,
      hallucinatedCitations: generation.run.metrics.hallucinatedCitations,
      correctRefusalRate: generation.run.metrics.correctRefusalRate,
      falseRefusalRate: generation.run.metrics.falseRefusalRate,
    },
  });
}

/** The smoke subset: questions tagged "smoke", or else the first 10 answerable ones. */
export function smokeSubset(set: QuestionSet, size = 10): QuestionSet {
  const tagged = set.questions.filter((q) => q.answerable && q.tags.includes("smoke"));
  return { ...set, questions: tagged.length ? tagged : set.questions.filter((q) => q.answerable).slice(0, size) };
}
