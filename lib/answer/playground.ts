import { z } from "zod";
import type { AnswerResult } from "./answer";
import { sourceTitle } from "./prompt";
import { closestSection } from "./refusal";

// The retrieval playground (T42): one question's whole path as data. Every candidate shows where
// each stage put it — vector arm, keyword arm, fusion, rerank — whether it was sent to the answer
// model (as [n]) and whether the answer cited it. Built from the same AnswerResult the app logs.

export const PlaygroundRequest = z.object({
  question: z.string().trim().min(1).max(2000),
  retrieval: z.enum(["vector", "hybrid"]),
  rerank: z.boolean(),
});
export type PlaygroundRequest = z.infer<typeof PlaygroundRequest>;

export type PlaygroundRow = {
  chunkKey: string;
  title: string;
  url: string;
  snippet: string;
  similarity: number;
  vectorRank: number | null;
  keywordRank: number | null;
  /** Position in the fused (or vector-only) pool before any rerank. */
  poolRank: number;
  /** Position the reranker gave it among the chunks sent, when the rerank ran. */
  rerankRank: number | null;
  /** The [n] it was sent to the answer model as, or null if it wasn't sent. */
  sentAs: number | null;
  cited: boolean;
};

export type PlaygroundView = {
  question: string;
  retrieval: "vector" | "hybrid";
  rerank: { requested: boolean; status: "off" | "applied" | "skipped"; note: string | null };
  gate: { topVectorSimilarity: number | null; threshold: number; thresholdSource: string; refused: boolean; reason: string | null };
  rows: PlaygroundRow[];
  answer: string | null;
  invalidMarkers: number[];
  costUsd: number;
  latencyMs: number;
};

/** Rows for the top `limit` of the pool, plus any chunk sent to the model from further down. */
export function playgroundView(result: AnswerResult, extras: { costUsd: number; rerankRequested: boolean; rerankNote: string | null }, limit = 20): PlaygroundView {
  const pool = result.pool ?? result.retrieved;
  const sent = new Map(result.kind === "refusal" ? [] : result.retrieved.map((c) => [c.id, c.rank]));
  const cited = new Set(result.kind === "answer" ? result.citations.cited.map((c) => c.n) : []);
  const reranked = result.rerankStatus === "applied";
  const rows = pool
    .filter((c) => c.rank <= limit || sent.has(c.id))
    .map((c) => {
      const n = sent.get(c.id) ?? null;
      return {
        chunkKey: c.chunkKey,
        title: sourceTitle(c),
        url: c.sourceUrl,
        snippet: closestSection(c, 180).snippet,
        similarity: c.similarity,
        vectorRank: c.vectorRank,
        keywordRank: c.keywordRank,
        poolRank: c.rank,
        rerankRank: reranked ? n : null,
        sentAs: n,
        cited: n !== null && cited.has(n),
      };
    });
  return {
    question: result.question,
    retrieval: result.config.retrieval,
    rerank: { requested: extras.rerankRequested, status: result.rerankStatus, note: extras.rerankNote },
    gate: {
      topVectorSimilarity: result.topVectorSimilarity,
      threshold: result.config.threshold,
      thresholdSource: result.config.thresholdSource,
      refused: result.kind === "refusal",
      reason: result.kind === "refusal" ? result.reason : null,
    },
    rows,
    answer: result.kind === "answer" ? result.answer : null,
    invalidMarkers: result.kind === "answer" ? result.citations.invalid : [],
    costUsd: Math.round(extras.costUsd * 1e8) / 1e8,
    latencyMs: result.latencyMs,
  };
}
