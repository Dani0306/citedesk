// npm run eval:report            — renders the README ablation table and evals/evidence.json from evals/runs/
// npm run eval:report -- --check — exits 1 if either is out of date (for CI, T41). Free: no model calls.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadQuestions } from "../evals/inputs";
import { buildSummary, DIAGNOSIS_END, DIAGNOSIS_START, renderAblation, renderDiagnosis, renderSummaryJson, replaceBlock, selectGeneration, withGeneration } from "../evals/report";
import { GenerationRun, JudgeRun, questionsHash, RetrievalRun } from "../evals/schema";

const root = process.cwd();
const RUNS = path.join(root, "evals", "runs");
const README = path.join(root, "README.md");
const SUMMARY = path.join(root, "evals", "evidence.json");

const SCHEMAS = { retrieval: RetrievalRun, generation: GenerationRun, judge: JudgeRun } as const;

/** Every run file, validated against the schema its `kind` names; threshold sweeps aren't reported here. */
function loadRuns() {
  const out = { retrieval: [] as { file: string; run: RetrievalRun }[], generation: [] as { file: string; run: GenerationRun }[], judge: [] as { file: string; run: JudgeRun }[] };
  if (!existsSync(RUNS)) return out;
  for (const file of readdirSync(RUNS).filter((f) => f.endsWith(".json") && !f.startsWith("ci-")).sort()) {
    const json = JSON.parse(readFileSync(path.join(RUNS, file), "utf8"));
    const kind = json.kind as keyof typeof SCHEMAS;
    if (!(kind in SCHEMAS)) continue;
    const parsed = SCHEMAS[kind].safeParse(json);
    if (!parsed.success) throw new Error(`${file} is not a valid ${kind} run: ${parsed.error.message}`);
    (out[kind] as { file: string; run: unknown }[]).push({ file, run: parsed.data });
  }
  return out;
}

function main() {
  const check = process.argv.includes("--check");
  const set = loadQuestions();
  const runs = loadRuns();
  const hash = questionsHash(set);
  const answerable = set.questions.filter((q) => q.answerable).length;
  const picked = selectGeneration(runs.generation, runs.judge, hash);
  const summary = withGeneration(buildSummary(runs.retrieval, hash, answerable), picked);

  const readme = readFileSync(README, "utf8");
  const nextReadme = replaceBlock(
    replaceBlock(readme, renderAblation(summary)),
    renderDiagnosis(picked, answerable, set.questions.length - answerable),
    DIAGNOSIS_START,
    DIAGNOSIS_END,
  );
  const nextSummary = renderSummaryJson(summary);
  const currentSummary = existsSync(SUMMARY) ? readFileSync(SUMMARY, "utf8") : "";

  if (check) {
    const stale = [readme !== nextReadme && "README.md", currentSummary !== nextSummary && "evals/evidence.json"].filter(Boolean);
    if (stale.length) {
      console.error(`Out of date: ${stale.join(", ")}. Run npm run eval:report and commit the result.`);
      process.exit(1);
    }
    console.log("Ablation table and evidence summary are up to date.");
    return;
  }

  writeFileSync(README, nextReadme);
  writeFileSync(SUMMARY, nextSummary);
  console.log(
    `Read ${runs.retrieval.length} retrieval, ${runs.generation.length} generation and ${runs.judge.length} judge run(s); ` +
      `reported ${summary.rows.length} ablation row(s), generation ${picked.gen ? "yes" : "pending"}, judge ${picked.judge ? "yes" : "pending"} ` +
      `(set ${summary.questionsHash.slice(0, 12)}, ${summary.questionCount} answerable).`,
  );
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
