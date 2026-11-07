import { answerQuestion, type AnswerConfig, type AnswerDeps, type CacheMode } from "../lib/answer/answer";
import type { CallSink, ModelCallRecord } from "../lib/calls/record";
import { PRICING_READ_ON } from "../lib/cost/pricing";
import { SpendCapError } from "./retrieval";
import { CacheRun } from "./schema";

export { CacheRun };

// The caching measurement (T38). Our prompts share less than the 1,024-token minimum across
// different questions, so only exact repeats can hit the cache. Implicit mode pays 1.25× to write
// every new prompt and 0.1× to read a repeat; off pays 1× always. Three passes over the same
// questions measure each side, and the break-even repeat share r* says when implicit is cheaper:
// with a share r of exact repeats it costs (1 − r)·U + r·R per question against O, so r* = (U − O) / (U − R).

/** Answerable questions that pass the gate (prompts 005/007/008), so every pass makes the same calls. */
export const CACHE_QUESTIONS = [
  "How do I create a partial index?",
  "How do I enable row level security on a table?",
  "When should I pick HNSW over IVFFlat?",
  "How do I enable the pgvector extension?",
];

export const PASSES = [
  { pass: "implicit-first", cacheMode: "implicit" },
  { pass: "implicit-repeat", cacheMode: "implicit" },
  { pass: "off", cacheMode: "off" },
] as const satisfies readonly { pass: string; cacheMode: CacheMode }[];

export function breakEven(U: number, R: number, O: number): number | null {
  if (U <= R) return null;
  return Math.min(1, Math.max(0, (U - O) / (U - R)));
}

const shareOf = (calls: { purpose: string; inputTokens: number; cachedInputTokens: number; cacheWriteTokens: number }[], key: "cachedInputTokens" | "cacheWriteTokens") => {
  const model = calls.filter((c) => c.purpose === "answer" || c.purpose === "rerank");
  const input = model.reduce((s, c) => s + c.inputTokens, 0);
  return input ? model.reduce((s, c) => s + c[key], 0) / input : 0;
};

export async function runCache(
  name: string,
  config: AnswerConfig,
  deps: AnswerDeps,
  opts: { maxUsd: number; gitSha: string; note?: string | null; questions?: string[]; date?: Date; onStep?: (label: string) => void },
): Promise<CacheRun> {
  const questions = opts.questions ?? CACHE_QUESTIONS;
  let spent = 0;
  let calls: ModelCallRecord[] = [];
  const sink: CallSink = async (record) => {
    spent += record.costUsd;
    calls.push(record);
    await deps.sink(record);
  };

  const passes: CacheRun["passes"] = [];
  for (const { pass, cacheMode } of PASSES) {
    const perQuestion: CacheRun["passes"][number]["perQuestion"] = [];
    for (const question of questions) {
      calls = [];
      const r = await answerQuestion(question, { ...deps, sink }, { ...config, cacheMode });
      if (spent > opts.maxUsd) throw new SpendCapError(spent, opts.maxUsd);
      perQuestion.push({
        question,
        refused: r.kind === "refusal",
        costUsd: Math.round(calls.reduce((s, c) => s + c.costUsd, 0) * 1e8) / 1e8,
        latencyMs: r.latencyMs,
        calls: calls.map(({ purpose, inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens, costUsd, latencyMs }) => ({
          purpose,
          inputTokens,
          cachedInputTokens,
          cacheWriteTokens,
          outputTokens,
          costUsd,
          latencyMs,
        })),
      });
      opts.onStep?.(`${pass} ${perQuestion.length}/${questions.length}`);
    }
    const all = perQuestion.flatMap((q) => q.calls);
    const latencies = perQuestion.map((q) => q.latencyMs).sort((a, b) => a - b);
    passes.push({
      pass,
      perQuestion,
      costPerQuestionUsd: perQuestion.reduce((s, q) => s + q.costUsd, 0) / perQuestion.length,
      cacheReadShare: shareOf(all, "cachedInputTokens"),
      cacheWriteShare: shareOf(all, "cacheWriteTokens"),
      p50LatencyMs: latencies[Math.ceil(latencies.length / 2) - 1],
    });
  }

  const [first, repeat, off] = passes;
  const U = first.costPerQuestionUsd;
  const R = repeat.costPerQuestionUsd;
  const O = off.costPerQuestionUsd;
  return CacheRun.parse({
    kind: "cache",
    createdAt: (opts.date ?? new Date()).toISOString(),
    gitSha: opts.gitSha,
    note: opts.note ?? null,
    config: { name, ...config },
    pricesReadOn: PRICING_READ_ON,
    questions,
    costUsd: Math.round(spent * 1e8) / 1e8,
    passes,
    U,
    R,
    O,
    breakEvenRepeatShare: breakEven(U, R, O),
    warning:
      first.cacheReadShare > 0.05
        ? `The first pass read ${(first.cacheReadShare * 100).toFixed(0)}% of its input from the cache (an earlier ask within the TTL), so U is understated.`
        : passes.some((p) => p.perQuestion.some((q) => q.refused))
          ? "A question was refused in some pass, so the passes didn't make the same calls."
          : null,
  });
}
