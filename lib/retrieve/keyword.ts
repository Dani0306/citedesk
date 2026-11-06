import { unwrap } from "../db/result";

// Full-text retrieval (T23) through keyword_documents: the question's lexemes ORed and ranked by
// ts_rank_cd over the weighted fts column (headings A, body B). Rows carry the cosine similarity
// to the query embedding too, so a chunk only the keyword arm found still has a real one.

/** Runs keyword_documents and returns its raw rows. */
export type KeywordFn = (question: string, embedding: number[], count: number) => Promise<unknown>;

type RpcClient = {
  rpc(
    fn: "keyword_documents",
    args: { query_text: string; query_embedding: number[]; match_count: number },
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string | null } | null }>;
};

export const supabaseKeyword =
  (client: RpcClient): KeywordFn =>
  async (question, embedding, count) =>
    unwrap(await client.rpc("keyword_documents", { query_text: question, query_embedding: embedding, match_count: count }));
