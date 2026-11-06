import type { RetrievedChunk } from "./vector";

// Reciprocal rank fusion (T24). Cosine similarity and ts_rank_cd live on scales that can't be
// compared, so RRF ignores the scores and adds 1 / (k + rank) from each list a chunk appears in.
// A chunk both arms rank well wins; k (60, Cormack et al. 2009) damps the gap between ranks 1 and 2.

export const DEFAULT_RRF_K = 60;

/** A ranked chunk that remembers where each arm put it (null: that arm didn't return it). */
export type RankedChunk = RetrievedChunk & { vectorRank: number | null; keywordRank: number | null };

export function fromVector(chunks: RetrievedChunk[]): RankedChunk[] {
  return chunks.map((c) => ({ ...c, vectorRank: c.rank, keywordRank: null }));
}

export function fuseRrf(vector: RetrievedChunk[], keyword: RetrievedChunk[], k = DEFAULT_RRF_K): (RankedChunk & { rrfScore: number })[] {
  const byId = new Map<number, RankedChunk & { rrfScore: number }>();
  const add = (chunk: RetrievedChunk, arm: "vectorRank" | "keywordRank") => {
    const entry = byId.get(chunk.id) ?? { ...chunk, vectorRank: null, keywordRank: null, rrfScore: 0 };
    entry[arm] = chunk.rank;
    entry.rrfScore += 1 / (k + chunk.rank);
    byId.set(chunk.id, entry);
  };
  for (const c of vector) add(c, "vectorRank");
  for (const c of keyword) add(c, "keywordRank");

  const last = Number.POSITIVE_INFINITY;
  return [...byId.values()]
    .sort(
      (a, b) =>
        b.rrfScore - a.rrfScore ||
        (a.vectorRank ?? last) - (b.vectorRank ?? last) ||
        (a.keywordRank ?? last) - (b.keywordRank ?? last) ||
        a.id - b.id,
    )
    .map((c, i) => ({ ...c, rank: i + 1 }));
}
