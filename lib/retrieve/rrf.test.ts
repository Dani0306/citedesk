import { describe, expect, it } from "vitest";
import { fuseRrf } from "@/lib/retrieve/rrf";
import type { RetrievedChunk } from "@/lib/retrieve/vector";

const list = (...ids: number[]): RetrievedChunk[] =>
  ids.map((id, i) => ({
    id,
    chunkKey: `ai/p#s${id}`,
    headingPath: ["P"],
    anchor: `s${id}`,
    sourceUrl: `https://supabase.com/docs/guides/ai/p#s${id}`,
    content: `c${id}`,
    similarity: 0.5,
    rank: i + 1,
  }));

describe("fuseRrf", () => {
  it("puts a chunk both arms found above chunks only one arm found", () => {
    // 3 is vector #3 and keyword #1: 1/63 + 1/61 beats vector #1 alone (1/61).
    const fused = fuseRrf(list(1, 2, 3), list(3, 4));
    expect(fused[0]).toMatchObject({ id: 3, rank: 1, vectorRank: 3, keywordRank: 1 });
    expect(fused[0].rrfScore).toBeCloseTo(1 / 63 + 1 / 61, 12);
  });

  it("breaks ties by vector rank, then keyword rank", () => {
    // 1 (vector #1) and 9 (keyword #1) both score 1/61.
    expect(fuseRrf(list(1), list(9)).map((c) => c.id)).toEqual([1, 9]);
  });

  it("renumbers ranks and keeps where each arm put the chunk", () => {
    const fused = fuseRrf(list(1, 2), list(2, 5));
    expect(fused.map((c) => [c.id, c.rank, c.vectorRank, c.keywordRank])).toEqual([
      [2, 1, 2, 1],
      [1, 2, 1, null],
      [5, 3, null, 2],
    ]);
  });

  it("returns the other arm's order when one arm is empty", () => {
    expect(fuseRrf([], list(4, 7)).map((c) => [c.id, c.rank, c.vectorRank])).toEqual([
      [4, 1, null],
      [7, 2, null],
    ]);
    expect(fuseRrf([], [])).toEqual([]);
  });

  it("lets k change how much rank 1 beats rank 2", () => {
    const small = fuseRrf(list(1, 2), [], 1);
    expect(small[0].rrfScore / small[1].rrfScore).toBeCloseTo(3 / 2, 12);
  });
});
