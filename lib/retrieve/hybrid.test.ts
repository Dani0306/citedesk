import { describe, expect, it } from "vitest";
import { memorySink } from "@/lib/calls/sinks";
import type { EmbedFn } from "@/lib/ingest/embed";
import { EMBEDDING_DIMENSIONS } from "@/lib/models";
import { searchCandidates } from "@/lib/retrieve/hybrid";
import type { KeywordFn } from "@/lib/retrieve/keyword";
import type { MatchFn } from "@/lib/retrieve/vector";

const embed: EmbedFn = async (values) => ({
  embeddings: values.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1)),
  usage: { tokens: 5 },
});
const row = (id: number, similarity: number) => ({
  id,
  chunk_key: `ai/p#s${id}`,
  heading_path: ["P"],
  anchor: `s${id}`,
  source_url: `https://supabase.com/docs/guides/ai/p#s${id}`,
  content: `c${id}`,
  similarity,
});
const match: MatchFn = async () => [row(1, 0.7), row(2, 0.6), row(3, 0.5)];
const keyword: KeywordFn = async () => [{ ...row(3, 0.5), keyword_rank: 2.1 }, { ...row(9, 0.2), keyword_rank: 1.4 }];

describe("searchCandidates", () => {
  it("vector mode keeps the vector order and marks no keyword ranks", async () => {
    const { sink } = memorySink();
    const r = await searchCandidates("q", { mode: "vector", count: 50, rrfK: 60 }, { embed, match, sink });
    expect(r.chunks.map((c) => [c.id, c.vectorRank, c.keywordRank])).toEqual([
      [1, 1, null],
      [2, 2, null],
      [3, 3, null],
    ]);
    expect(r.topVector?.id).toBe(1);
  });

  it("hybrid mode embeds once, fuses both arms and keeps the gate on the vector arm", async () => {
    const asked: string[] = [];
    const { records, sink } = memorySink();
    const r = await searchCandidates(
      "q",
      { mode: "hybrid", count: 50, rrfK: 60 },
      { embed, match, keyword: async (...a) => (asked.push(a[0]), keyword(...a)), sink },
    );
    expect(records.map((x) => x.purpose)).toEqual(["embed_query"]);
    expect(asked).toEqual(["q"]);
    // 3 is in both arms, so it leads; the gate still reads vector #1 (similarity 0.7).
    expect(r.chunks[0]).toMatchObject({ id: 3, vectorRank: 3, keywordRank: 1 });
    expect(r.chunks.find((c) => c.id === 9)).toMatchObject({ vectorRank: null, keywordRank: 2, similarity: 0.2 });
    expect(r.topVector).toMatchObject({ id: 1, similarity: 0.7 });
  });

  it("has no top vector chunk when the table is empty", async () => {
    const { sink } = memorySink();
    const r = await searchCandidates("q", { mode: "hybrid", count: 50, rrfK: 60 }, { embed, match: async () => [], keyword: async () => [], sink });
    expect(r).toEqual({ chunks: [], topVector: null });
  });

  it("refuses hybrid mode without a keyword function", async () => {
    const { sink } = memorySink();
    await expect(searchCandidates("q", { mode: "hybrid", count: 50, rrfK: 60 }, { embed, match, sink })).rejects.toThrow(/keyword/);
  });
});
