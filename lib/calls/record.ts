import type { EmbeddingModelUsage, LanguageModelUsage } from "ai";
import { z } from "zod";
import { callCostUsd, priceFor, type BilledTokens } from "../cost/pricing";

// One record per model call, success or failure, in the same shape for the scripts' JSONL log
// and the app's citedesk.model_calls table. Tokens come from the SDK's usage, never estimated.

export const CALL_PURPOSES = ["embed_document", "embed_query", "answer", "rerank", "judge", "context"] as const;
export const CALL_OUTCOMES = ["ok", "api_error", "invalid_output"] as const;

const count = z.number().int().nonnegative();

export const ModelCallRecord = z.object({
  at: z.iso.datetime(),
  queryId: z.number().int().positive().nullable(),
  purpose: z.enum(CALL_PURPOSES),
  model: z.string().min(1),
  outcome: z.enum(CALL_OUTCOMES),
  inputTokens: count,
  cachedInputTokens: count,
  cacheWriteTokens: count,
  outputTokens: count,
  reasoningTokens: count,
  costUsd: z.number().nonnegative(),
  latencyMs: count,
  error: z.string().nullable(),
  rawUsage: z.unknown().nullable(),
});
export type ModelCallRecord = z.infer<typeof ModelCallRecord>;

export type CallSink = (record: ModelCallRecord) => Promise<void>;
export type CallMeta = { purpose: (typeof CALL_PURPOSES)[number]; model: string; queryId?: number | null };
export type CallTokens = BilledTokens & { inputTokens: number; reasoningTokens: number };

export const NO_TOKENS: CallTokens = {
  inputTokens: 0,
  noCacheInputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
};

/**
 * Every usage field is optional in AI SDK v7. When noCacheTokens is missing it is derived on
 * the assumption that cache reads and writes are counted inside inputTokens; rawUsage is stored
 * so the first live call can confirm it.
 */
export function usageFromLanguageModel(usage: LanguageModelUsage): CallTokens {
  const inputTokens = usage.inputTokens ?? 0;
  const cachedInputTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.inputTokenDetails?.cacheWriteTokens ?? 0;
  const noCacheInputTokens =
    usage.inputTokenDetails?.noCacheTokens ?? Math.max(0, inputTokens - cachedInputTokens - cacheWriteTokens);
  return {
    inputTokens,
    noCacheInputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
  };
}

export function usageFromEmbedding(usage: EmbeddingModelUsage): CallTokens {
  return { ...NO_TOKENS, inputTokens: usage.tokens, noCacheInputTokens: usage.tokens };
}

/** Usage readers for the two result shapes the app calls. */
export const fromText = (r: { usage: LanguageModelUsage }) => ({
  tokens: usageFromLanguageModel(r.usage),
  raw: r.usage.raw ?? null,
});
export const fromEmbedding = (r: { usage: EmbeddingModelUsage }) => ({ tokens: usageFromEmbedding(r.usage), raw: null });

export function buildRecord(
  meta: CallMeta,
  tokens: CallTokens,
  result: { outcome: ModelCallRecord["outcome"]; latencyMs: number; error?: string | null; rawUsage?: unknown; at?: Date },
): ModelCallRecord {
  return ModelCallRecord.parse({
    at: (result.at ?? new Date()).toISOString(),
    queryId: meta.queryId ?? null,
    purpose: meta.purpose,
    model: meta.model,
    outcome: result.outcome,
    inputTokens: tokens.inputTokens,
    cachedInputTokens: tokens.cachedInputTokens,
    cacheWriteTokens: tokens.cacheWriteTokens,
    outputTokens: tokens.outputTokens,
    reasoningTokens: tokens.reasoningTokens,
    costUsd: callCostUsd(meta.model, tokens),
    latencyMs: Math.max(0, Math.round(result.latencyMs)),
    error: result.error ?? null,
    rawUsage: result.rawUsage ?? null,
  });
}

/**
 * Runs one model call and writes exactly one record for it. An unpriced model throws before the
 * call is made, so nothing is ever spent without a price. A failed call is logged as api_error
 * with zero tokens (the provider reports no usage for it) and the error is re-thrown.
 */
export async function recordCall<T>(
  sink: CallSink,
  meta: CallMeta,
  run: () => Promise<T>,
  readUsage: (result: T) => { tokens: CallTokens; raw: unknown },
  now: () => number = () => performance.now(),
): Promise<T> {
  priceFor(meta.model);
  const start = now();
  let result: T;
  try {
    result = await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sink(buildRecord(meta, NO_TOKENS, { outcome: "api_error", latencyMs: now() - start, error: message || "Unknown error" }));
    throw error;
  }
  const { tokens, raw } = readUsage(result);
  await sink(buildRecord(meta, tokens, { outcome: "ok", latencyMs: now() - start, rawUsage: raw }));
  return result;
}
