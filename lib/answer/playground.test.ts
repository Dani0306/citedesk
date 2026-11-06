import { describe, expect, it } from "vitest";
import { defaultConfig, type AnswerResult } from "@/lib/answer/answer";
import { playgroundView, PlaygroundRequest } from "@/lib/answer/playground";
import type { RankedChunk } from "@/lib/retrieve/rrf";

const chunk = (id: number, rank: number, vectorRank: number | null, keywordRank: number | null): RankedChunk => ({
  id,
  chunkKey: `ai/p#s${id}`,
  headingPath: ["P", `S${id}`],
  anchor: `s${id}`,
  sourceUrl: `https://supabase.com/docs/guides/ai/p#s${id}`,
  content: `Passage ${id}.`,
  similarity: 0.7 - rank / 100,
  rank,
  vectorRank,
  keywordRank,
});

// Fused pool of 25; the reranker sent 24 (from far down) as [1] and 2 as [2]; the answer cites [1].
const pool = Array.from({ length: 25 }, (_, i) => chunk(i + 1, i + 1, i + 1, i % 3 === 0 ? i / 3 + 1 : null));
const answer: AnswerResult = {
  kind: "answer",
  question: "q",
  config: { ...defaultConfig({}), retrieval: "hybrid", rerank: true, k: 2 },
  retrieved: [
    { ...pool[23], rank: 1 },
    { ...pool[1], rank: 2 },
  ],
  pool,
  topVectorSimilarity: 0.69,
  rerankStatus: "applied",
  latencyMs: 4000,
  answer: "From far down [1]. Also [7].",
  citations: { cited: [{ n: 1, chunkId: 24 }], invalid: [7], uncitedSentences: 0 },
  finishReason: "stop",
};

describe("playgroundView", () => {
  it("shows the top 20 of the pool plus anything sent from further down, with every stage's rank", () => {
    const v = playgroundView(answer, { costUsd: 0.0018, rerankRequested: true, rerankNote: null });
    expect(v.rows).toHaveLength(21);
    expect(v.rows.at(-1)).toMatchObject({ chunkKey: "ai/p#s24", poolRank: 24, rerankRank: 1, sentAs: 1, cited: true });
    expect(v.rows[1]).toMatchObject({ chunkKey: "ai/p#s2", poolRank: 2, vectorRank: 2, keywordRank: null, rerankRank: 2, sentAs: 2, cited: false });
    expect(v.rows[0]).toMatchObject({ poolRank: 1, keywordRank: 1, sentAs: null, rerankRank: null, cited: false });
    expect(v).toMatchObject({ invalidMarkers: [7], gate: { refused: false, topVectorSimilarity: 0.69 }, rerank: { status: "applied" } });
  });

  it("marks nothing as sent or cited on a refusal, and shows the gate's reason", () => {
    const refusal: AnswerResult = {
      kind: "refusal",
      question: "q",
      config: defaultConfig({}),
      retrieved: pool.slice(0, 8),
      pool: pool.slice(0, 8),
      topVectorSimilarity: 0.41,
      rerankStatus: "off",
      latencyMs: 900,
      reason: "low_score",
      closest: null,
    };
    const v = playgroundView(refusal, { costUsd: 0.0000003, rerankRequested: false, rerankNote: null });
    expect(v.rows.every((r) => r.sentAs === null && !r.cited)).toBe(true);
    expect(v.gate).toMatchObject({ refused: true, reason: "low_score", topVectorSimilarity: 0.41 });
    expect(v.answer).toBeNull();
  });

  it("validates requests", () => {
    expect(PlaygroundRequest.safeParse({ question: "q", retrieval: "hybrid", rerank: true }).success).toBe(true);
    expect(PlaygroundRequest.safeParse({ question: "", retrieval: "hybrid", rerank: true }).success).toBe(false);
    expect(PlaygroundRequest.safeParse({ question: "q", retrieval: "bm25", rerank: false }).success).toBe(false);
  });
});
