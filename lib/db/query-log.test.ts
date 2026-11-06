import { describe, expect, it } from "vitest";
import { defaultConfig, type AnswerResult } from "@/lib/answer/answer";
import { buildRecord, NO_TOKENS, type ModelCallRecord } from "@/lib/calls/record";
import { memorySink } from "@/lib/calls/sinks";
import { DbError } from "@/lib/db/result";
import { persistQuery, supabaseInsertQueryLog, toQueryLogRow, type QueryLogRow } from "@/lib/db/query-log";
import type { RetrievedChunk } from "@/lib/retrieve/vector";

const config = defaultConfig({});
const chunk = (id: number, similarity: number, rank: number): RetrievedChunk => ({
  id,
  chunkKey: `database/x#s${id}`,
  headingPath: ["X"],
  anchor: `s${id}`,
  sourceUrl: `https://supabase.com/docs/guides/database/x#s${id}`,
  content: "c",
  similarity,
  rank,
});
const retrieved = [chunk(11, 0.7, 1), chunk(12, 0.6, 2)];

const records: ModelCallRecord[] = [
  buildRecord({ purpose: "embed_query", model: "text-embedding-3-small" }, { ...NO_TOKENS, inputTokens: 10, noCacheInputTokens: 10 }, { outcome: "ok", latencyMs: 80 }),
  buildRecord(
    { purpose: "answer", model: "gpt-6-luna" },
    { ...NO_TOKENS, inputTokens: 2000, noCacheInputTokens: 2000, outputTokens: 100 },
    { outcome: "ok", latencyMs: 900 },
  ),
];

const answer: AnswerResult = {
  kind: "answer",
  question: "q",
  config,
  retrieved,
  latencyMs: 1200,
  answer: "A [1]. B [3].",
  citations: { cited: [{ n: 1, chunkId: 11 }], invalid: [3], uncitedSentences: 0 },
  finishReason: "stop",
};
const refusal: AnswerResult = {
  kind: "refusal",
  question: "q",
  config,
  retrieved,
  latencyMs: 90,
  reason: "low_score",
  closest: null,
};

describe("toQueryLogRow", () => {
  it("records retrieval, citations and the summed tokens and cost of the question's calls", () => {
    const row = toQueryLogRow(answer, records);
    expect(row).toMatchObject({
      rerank_status: "off",
      cited_chunk_ids: [11],
      refused: false,
      refusal_reason: null,
      invalid_citations: 1,
      input_tokens: 2010,
      output_tokens: 100,
      latency_ms: 1200,
    });
    expect(row.cost_usd).toBeCloseTo(records[0].costUsd + records[1].costUsd, 8);
    expect(row.retrieved).toEqual([
      { id: 11, chunkKey: "database/x#s11", similarity: 0.7, rank: 1 },
      { id: 12, chunkKey: "database/x#s12", similarity: 0.6, rank: 2 },
    ]);
    expect(row.config).toMatchObject({ retrieval: "vector", k: 8, thresholdSource: "provisional", promptVersion: 1 });
  });

  it("stores a refusal with its reason and no answer", () => {
    expect(toQueryLogRow(refusal, records.slice(0, 1))).toMatchObject({ refused: true, refusal_reason: "low_score", answer: null, cited_chunk_ids: [] });
  });
});

describe("persistQuery", () => {
  it("writes the row first, then every call with its query_id", async () => {
    const rows: QueryLogRow[] = [];
    const { records: written, sink } = memorySink();
    const id = await persistQuery({ insertQueryLog: async (r) => (rows.push(r), 42), sink }, answer, records);
    expect(id).toBe(42);
    expect(rows).toHaveLength(1);
    expect(written.map((r) => r.queryId)).toEqual([42, 42]);
  });

  it("still writes the calls, unlinked, when the question failed", async () => {
    const { records: written, sink } = memorySink();
    const id = await persistQuery({ insertQueryLog: async () => 1, sink }, null, records);
    expect(id).toBeNull();
    expect(written.map((r) => r.queryId)).toEqual([null, null]);
  });

  it("still writes the calls when the query_log insert fails, then rethrows", async () => {
    const { records: written, sink } = memorySink();
    const failing = async () => {
      throw new DbError({ message: "permission denied", code: "42501" });
    };
    await expect(persistQuery({ insertQueryLog: failing, sink }, answer, records)).rejects.toBeInstanceOf(DbError);
    expect(written).toHaveLength(2);
  });
});

describe("supabaseInsertQueryLog", () => {
  it("turns an insert error into a DbError", async () => {
    const client = {
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "nope", code: "42501" } }) }) }) }),
    };
    await expect(supabaseInsertQueryLog(client)(toQueryLogRow(refusal, []))).rejects.toBeInstanceOf(DbError);
  });
});
