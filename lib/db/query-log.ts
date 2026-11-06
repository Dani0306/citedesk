import type { AnswerResult } from "../answer/answer";
import type { CallSink, ModelCallRecord } from "../calls/record";
import { unwrap } from "./result";

// query_log writes (T17). A question's model calls are buffered while it runs, because the
// query_log id they point at only exists once it is finished. persistQuery writes the row, then
// the calls with query_id set; if anything failed first, the calls are still written, unlinked.

export function toQueryLogRow(result: AnswerResult, records: ModelCallRecord[]) {
  const sum = (pick: (r: ModelCallRecord) => number) => records.reduce((total, r) => total + pick(r), 0);
  const answered = result.kind === "answer";
  return {
    query: result.question,
    config: result.config,
    retrieved: result.retrieved.map(({ id, chunkKey, similarity, rank, vectorRank, keywordRank }) => ({
      id,
      chunkKey,
      similarity,
      rank,
      vectorRank,
      keywordRank,
    })),
    rerank_status: result.rerankStatus,
    cited_chunk_ids: answered ? result.citations.cited.map((c) => c.chunkId) : [],
    refused: !answered,
    refusal_reason: answered ? null : result.reason,
    answer: answered ? result.answer : null,
    invalid_citations: answered ? result.citations.invalid.length : 0,
    uncited_sentences: answered ? result.citations.uncitedSentences : 0,
    input_tokens: sum((r) => r.inputTokens),
    output_tokens: sum((r) => r.outputTokens),
    cost_usd: Math.round(sum((r) => r.costUsd) * 1e8) / 1e8,
    latency_ms: result.latencyMs,
  };
}
export type QueryLogRow = ReturnType<typeof toQueryLogRow>;

/** Inserts one query_log row and returns its id. */
export type InsertQueryLog = (row: QueryLogRow) => Promise<number>;

type QueryLogClient = {
  from(table: "query_log"): {
    insert(row: QueryLogRow): {
      select(columns: "id"): {
        single(): PromiseLike<{ data: { id: number } | null; error: { message: string; code?: string | null } | null }>;
      };
    };
  };
};

export const supabaseInsertQueryLog =
  (client: QueryLogClient): InsertQueryLog =>
  async (row) => {
    const data = unwrap(await client.from("query_log").insert(row).select("id").single());
    if (!data) throw new Error("query_log insert returned no id");
    return data.id;
  };

/**
 * Writes the query_log row (when there is a result) and every buffered call record. Returns the
 * query_log id, or null when the question failed before finishing.
 */
export async function persistQuery(
  { insertQueryLog, sink }: { insertQueryLog: InsertQueryLog; sink: CallSink },
  result: AnswerResult | null,
  records: ModelCallRecord[],
): Promise<number | null> {
  let queryId: number | null = null;
  try {
    if (result) queryId = await insertQueryLog(toQueryLogRow(result, records));
  } finally {
    for (const record of records) await sink({ ...record, queryId });
  }
  return queryId;
}
