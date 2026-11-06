import { z } from "zod";
import type { CallSink } from "../calls/record";
import { unwrap } from "../db/result";
import { embedAll, type EmbedFn } from "../ingest/embed";

// Vector retrieval (T13): embed the question, then rank chunks through match_documents. The
// function sets hnsw.ef_search to the requested count on every call (prompt 004 measured a
// LIMIT 50 returning 40 rows at the default), so always query through it, never raw SQL.

export const MAX_MATCH_COUNT = 200; // match_documents and keyword_documents reject anything above this

/** A row from match_documents or keyword_documents (which adds keyword_rank). */
export const ChunkRow = z.object({
  id: z.number(),
  chunk_key: z.string(),
  heading_path: z.array(z.string()),
  anchor: z.string(),
  source_url: z.string(),
  content: z.string(),
  similarity: z.number(),
});

export const RetrievedChunk = z.object({
  id: z.number().int().positive(),
  chunkKey: z.string().min(1),
  headingPath: z.array(z.string()),
  anchor: z.string(),
  sourceUrl: z.string(),
  content: z.string(),
  /** 1 − cosine distance to the query, whichever arm found the chunk. */
  similarity: z.number(),
  /** 1-based position in the ranking. */
  rank: z.number().int().positive(),
});
export type RetrievedChunk = z.infer<typeof RetrievedChunk>;

/** Rows in ranked order become chunks ranked 1..n. Throws on rows of the wrong shape. */
export function toChunks(rows: unknown): RetrievedChunk[] {
  return z
    .array(ChunkRow)
    .parse(rows ?? [])
    .map((r, i) => ({
      id: r.id,
      chunkKey: r.chunk_key,
      headingPath: r.heading_path,
      anchor: r.anchor,
      sourceUrl: r.source_url,
      content: r.content,
      similarity: r.similarity,
      rank: i + 1,
    }));
}

export function checkCount(k: number): void {
  if (!Number.isInteger(k) || k < 1 || k > MAX_MATCH_COUNT) throw new Error(`k must be between 1 and ${MAX_MATCH_COUNT}, got ${k}`);
}

/** Runs match_documents and returns its raw rows. */
export type MatchFn = (embedding: number[], count: number) => Promise<unknown>;

type RpcClient = {
  rpc(
    fn: "match_documents",
    args: { query_embedding: number[]; match_count: number },
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string | null } | null }>;
};

/** The real MatchFn. A grant or schema error throws a DbError instead of reading as zero rows. */
export const supabaseMatch =
  (client: RpcClient): MatchFn =>
  async (embedding, count) =>
    unwrap(await client.rpc("match_documents", { query_embedding: embedding, match_count: count }));

export async function embedQuery(question: string, { embed, sink }: { embed: EmbedFn; sink: CallSink }): Promise<number[]> {
  const [embedding] = await embedAll([question], { embed, sink, purpose: "embed_query" });
  return embedding;
}

export async function vectorSearch(
  question: string,
  k: number,
  { embed, match, sink }: { embed: EmbedFn; match: MatchFn; sink: CallSink },
): Promise<RetrievedChunk[]> {
  checkCount(k);
  return toChunks(await match(await embedQuery(question, { embed, sink }), k));
}
