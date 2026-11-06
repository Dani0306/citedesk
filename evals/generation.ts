import { answerQuestion, defaultConfig, type AnswerConfig, type AnswerDeps } from "../lib/answer/answer";
import { splitSentences } from "../lib/answer/citations";
import type { CallSink } from "../lib/calls/record";
import { callCostUsd, PRICING_READ_ON } from "../lib/cost/pricing";
import { countTokens } from "../lib/ingest/chunk";
import { EMBEDDING_MODEL } from "../lib/models";
import { normaliseLabel } from "./labels";
import { percentile } from "./metrics";
import { SpendCapError } from "./retrieval";
import { GenerationRun, questionsHash, type GenerationQuestion, type QuestionSet } from "./schema";

// The generation eval (T34): every question through the same answerQuestion the app uses, with
// what each stage did recorded per question, so a failure is attributed to retrieval, the gate or
// generation, never just "wrong". Hallucinated citations are counted in code here; whether a valid
// citation actually supports its sentence is the judge's job (T36).

export const GENERATION_CONFIGS: Record<string, { overrides: Partial<AnswerConfig>; defaultMaxUsd: number }> = {
  vector: { overrides: { retrieval: "vector", rerank: false }, defaultMaxUsd: 0.1 },
  hybrid: { overrides: { retrieval: "hybrid", rerank: false }, defaultMaxUsd: 0.1 },
  "hybrid-rerank": { overrides: { retrieval: "hybrid", rerank: true }, defaultMaxUsd: 0.3 },
};

/** Worst case: the embedding, 8 chunks at the 800-token cap all billed as a cache write, every output token, and a rerank if on. */
export function estimateGenerationUsd(set: QuestionSet, config: AnswerConfig): number {
  const embed = callCostUsd(EMBEDDING_MODEL, {
    noCacheInputTokens: set.questions.reduce((s, q) => s + countTokens(q.question), 0),
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
  });
  const answer = callCostUsd(config.answerModel, { noCacheInputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: config.k * 800 + 600, outputTokens: config.maxOutputTokens });
  const rerank = config.rerank
    ? callCostUsd(config.answerModel, { noCacheInputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: config.candidates * 320 + 400, outputTokens: 1000 })
    : 0;
  return embed + set.questions.length * (answer + rerank);
}

export async function runGeneration(
  set: QuestionSet,
  name: string,
  config: AnswerConfig,
  deps: AnswerDeps,
  opts: { maxUsd: number; gitSha: string; note?: string | null; now?: () => number; date?: Date; onQuestion?: (done: number, total: number) => void },
): Promise<GenerationRun> {
  if (set.questions.length === 0) throw new Error("No questions to run");
  let spent = 0;
  let calls: { inputTokens: number; outputTokens: number; costUsd: number }[] = [];
  const sink: CallSink = async (record) => {
    spent += record.costUsd;
    calls.push(record);
    await deps.sink(record);
  };

  const perQuestion: GenerationQuestion[] = [];
  for (const q of set.questions) {
    calls = [];
    const r = await answerQuestion(q.question, { ...deps, sink, now: opts.now ?? deps.now }, config);
    if (spent > opts.maxUsd) throw new SpendCapError(spent, opts.maxUsd);

    const expected = q.expected.map(normaliseLabel);
    const labelled = new Set(expected);
    const answered = r.kind === "answer";
    const cited = answered ? r.citations.cited.map((c) => r.retrieved[c.n - 1].chunkKey) : [];
    const citedKeys = [...new Set(cited)];
    const sum = (pick: (c: (typeof calls)[number]) => number) => calls.reduce((s, c) => s + pick(c), 0);

    perQuestion.push({
      id: q.id,
      question: q.question,
      answerable: q.answerable,
      tags: q.tags,
      expected,
      outcome: answered ? (q.answerable ? "answered" : "answered_unanswerable") : q.answerable ? "false_refusal" : "correct_refusal",
      refusalReason: answered ? null : r.reason,
      topVectorSimilarity: r.topVectorSimilarity,
      answer: answered ? r.answer : null,
      sentences: answered ? splitSentences(r.answer) : [],
      sources: r.retrieved.map((c) => ({ n: c.rank, chunkKey: c.chunkKey, headingPath: c.headingPath, content: c.content })),
      citedChunkKeys: citedKeys,
      invalidMarkers: answered ? r.citations.invalid : [],
      citationPrecision: answered && q.answerable && cited.length ? cited.filter((k) => labelled.has(k)).length / cited.length : null,
      retrievedLabelled: q.answerable ? r.retrieved.some((c) => labelled.has(c.chunkKey)) : null,
      citedLabelled: q.answerable && answered ? citedKeys.some((k) => labelled.has(k)) : null,
      rerankStatus: r.rerankStatus,
      inputTokens: sum((c) => c.inputTokens),
      outputTokens: sum((c) => c.outputTokens),
      costUsd: Math.round(sum((c) => c.costUsd) * 1e8) / 1e8,
      latencyMs: r.latencyMs,
    });
    opts.onQuestion?.(perQuestion.length, set.questions.length);
  }

  const answerable = perQuestion.filter((p) => p.answerable);
  const unanswerable = perQuestion.filter((p) => !p.answerable);
  const answered = perQuestion.filter((p) => p.answer !== null);
  const precisions = answerable.map((p) => p.citationPrecision).filter((x): x is number => x !== null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

  return GenerationRun.parse({
    kind: "generation",
    createdAt: (opts.date ?? new Date()).toISOString(),
    gitSha: opts.gitSha,
    note: opts.note ?? null,
    config: { name, ...config },
    models: { embedding: EMBEDDING_MODEL, answer: config.answerModel, rerank: config.rerank ? config.answerModel : null },
    pricesReadOn: PRICING_READ_ON,
    questionsHash: questionsHash(set),
    answerableCount: answerable.length,
    unanswerableCount: unanswerable.length,
    costUsd: Math.round(spent * 1e8) / 1e8,
    metrics: {
      hallucinatedCitations: perQuestion.reduce((s, p) => s + p.invalidMarkers.length, 0),
      citationPrecision: mean(precisions),
      correctRefusalRate: unanswerable.length ? unanswerable.filter((p) => p.outcome === "correct_refusal").length / unanswerable.length : null,
      falseRefusalRate: answerable.length ? answerable.filter((p) => p.outcome === "false_refusal").length / answerable.length : null,
      answered: answered.length,
      costPerQuestionUsd: Math.round((spent / perQuestion.length) * 1e8) / 1e8,
      tokensPerAnswer: mean(answered.map((p) => p.inputTokens + p.outputTokens)),
      latencyMs: { p50: percentile(perQuestion.map((p) => p.latencyMs), 0.5), p95: percentile(perQuestion.map((p) => p.latencyMs), 0.95) },
    },
    perQuestion,
  });
}

export function generationConfig(name: string, env: Record<string, string | undefined> = process.env): AnswerConfig {
  const entry = GENERATION_CONFIGS[name];
  if (!entry) throw new Error(`Unknown --config=${name}. Known: ${Object.keys(GENERATION_CONFIGS).join(", ")}`);
  return { ...defaultConfig(env), ...entry.overrides };
}
