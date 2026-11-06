import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { unwrap } from "../db/result";
import { ModelCallRecord, type CallSink } from "./record";

/** Scripts: one JSON line per call in logs/model-calls.jsonl (gitignored). */
export function jsonlSink(file = path.join(process.cwd(), "logs", "model-calls.jsonl")): CallSink {
  return async (record) => {
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(ModelCallRecord.parse(record))}\n`);
  };
}

/** The citedesk.model_calls row for a record. */
export function toRow(record: ModelCallRecord) {
  return {
    created_at: record.at,
    query_id: record.queryId,
    purpose: record.purpose,
    model: record.model,
    outcome: record.outcome,
    input_tokens: record.inputTokens,
    cached_input_tokens: record.cachedInputTokens,
    cache_write_tokens: record.cacheWriteTokens,
    output_tokens: record.outputTokens,
    reasoning_tokens: record.reasoningTokens,
    cost_usd: record.costUsd,
    latency_ms: record.latencyMs,
    error: record.error,
    raw_usage: record.rawUsage,
  };
}

type InsertClient = {
  from(table: "model_calls"): {
    insert(row: ReturnType<typeof toRow>): PromiseLike<{ data: unknown; error: { message: string; code?: string | null } | null }>;
  };
};

/** Routes: one citedesk.model_calls row per call. A failed insert throws; the log is never skipped quietly. */
export function dbSink(client: InsertClient): CallSink {
  return async (record) => {
    unwrap(await client.from("model_calls").insert(toRow(ModelCallRecord.parse(record))));
  };
}
