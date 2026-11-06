import type { CallSink } from "../calls/record";
import type { EmbedFn } from "../ingest/embed";
import type { KeywordFn } from "./keyword";
import { fromVector, fuseRrf, type RankedChunk } from "./rrf";
import { checkCount, embedQuery, toChunks, type MatchFn } from "./vector";

// The candidate pool for every retrieval mode: one query embedding, then the vector arm alone or
// both arms in parallel fused with RRF. The refusal gate reads the vector arm's top similarity
// (T02) whichever mode runs, so a keyword-only hit can never lift a question past it.

export type RetrievalMode = "vector" | "hybrid";

export type Candidates = {
  chunks: RankedChunk[];
  /** The vector arm's rank-1 chunk: what the refusal gate and the closest-section reply use. */
  topVector: RankedChunk | null;
};

export async function searchCandidates(
  question: string,
  { mode, count, rrfK }: { mode: RetrievalMode; count: number; rrfK: number },
  deps: { embed: EmbedFn; match: MatchFn; keyword?: KeywordFn; sink: CallSink },
): Promise<Candidates> {
  checkCount(count);
  if (mode === "hybrid" && !deps.keyword) throw new Error("Hybrid retrieval needs a keyword search function");
  const embedding = await embedQuery(question, deps);
  const [vectorRows, keywordRows] = await Promise.all([
    deps.match(embedding, count),
    mode === "hybrid" ? deps.keyword!(question, embedding, count) : Promise.resolve([]),
  ]);
  const vector = toChunks(vectorRows);
  const chunks = mode === "hybrid" ? fuseRrf(vector, toChunks(keywordRows), rrfK).slice(0, count) : fromVector(vector);
  const topVector = vector[0] ? (chunks.find((c) => c.id === vector[0].id) ?? { ...vector[0], vectorRank: 1, keywordRank: null }) : null;
  return { chunks, topVector };
}
