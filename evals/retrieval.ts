import type { CallSink } from "../lib/calls/record";
import { callCostUsd, PRICING_READ_ON } from "../lib/cost/pricing";
import { countTokens } from "../lib/ingest/chunk";
import { EMBEDDING_MODEL } from "../lib/models";
import type { RetrievalConfig, RetrievalDeps } from "./configs";
import { normaliseLabel } from "./labels";
import { aggregate, percentile, scoreQuestion } from "./metrics";
import { questionsHash, RetrievalRun, type QuestionResult, type QuestionSet } from "./schema";

// One retrieval eval run (T21): every answerable question through one config, scored, and
// returned as a validated run file. Pure apart from the injected retrieval dependencies, so the
// spend cap and the file shape are tested without a network.

export class SpendCapError extends Error {
  constructor(spent: number, cap: number) {
    super(`Spent $${spent.toFixed(8)}, over the --max-usd cap of $${cap}; stopped before writing a run file`);
    this.name = "SpendCapError";
  }
}

/** Upper-bound cost of embedding every answerable question once, from the tokenizer. */
export function estimateRetrievalCostUsd(set: QuestionSet): number {
  const tokens = set.questions.filter((q) => q.answerable).reduce((sum, q) => sum + countTokens(q.question), 0);
  return callCostUsd(EMBEDDING_MODEL, { noCacheInputTokens: tokens, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 });
}

export async function runRetrieval(
  set: QuestionSet,
  config: RetrievalConfig,
  deps: RetrievalDeps,
  opts: { maxUsd: number; gitSha: string; note?: string | null; now?: () => number; date?: Date; onQuestion?: (done: number, total: number) => void },
): Promise<RetrievalRun> {
  const now = opts.now ?? (() => performance.now());
  const answerable = set.questions.filter((q) => q.answerable);
  if (answerable.length === 0) throw new Error("No answerable questions to score");

  let spent = 0;
  const sink: CallSink = async (record) => {
    spent += record.costUsd;
    await deps.sink(record);
  };

  const perQuestion: QuestionResult[] = [];
  for (const q of answerable) {
    const before = spent;
    const start = now();
    const chunks = await config.retrieve(q.question, { ...deps, sink });
    const latencyMs = Math.round(now() - start);
    if (spent > opts.maxUsd) throw new SpendCapError(spent, opts.maxUsd);

    const expected = q.expected.map(normaliseLabel);
    const scored = scoreQuestion(
      chunks.map((c) => c.chunkKey),
      expected,
    );
    perQuestion.push({
      id: q.id,
      question: q.question,
      tags: q.tags,
      expected,
      retrieved: chunks.slice(0, config.params.k).map(({ chunkKey, similarity, rank }) => ({ chunkKey, similarity, rank })),
      firstRelevantRank: scored.firstRelevantRank,
      metrics: scored.metrics,
      stage: { retrieval: scored.stage },
      latencyMs,
      costUsd: Math.round((spent - before) * 1e8) / 1e8,
    });
    opts.onQuestion?.(perQuestion.length, answerable.length);
  }

  const latencies = perQuestion.map((r) => r.latencyMs);
  const costUsd = Math.round(spent * 1e8) / 1e8;
  return RetrievalRun.parse({
    kind: "retrieval",
    createdAt: (opts.date ?? new Date()).toISOString(),
    gitSha: opts.gitSha,
    note: opts.note ?? null,
    config: { name: config.name, ...config.params },
    models: { embedding: EMBEDDING_MODEL },
    pricesReadOn: PRICING_READ_ON,
    questionsHash: questionsHash(set),
    questionCount: perQuestion.length,
    skippedUnanswerable: set.questions.length - answerable.length,
    costUsd,
    costPerQueryUsd: Math.round((spent / perQuestion.length) * 1e8) / 1e8,
    latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
    metrics: aggregate(perQuestion.map((r) => r.metrics)),
    perQuestion,
  });
}
