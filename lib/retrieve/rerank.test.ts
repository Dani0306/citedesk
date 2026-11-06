import type { LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { memorySink } from "@/lib/calls/sinks";
import { buildRerankPrompt, rerankChunks, seedFrom, shuffled, truncateTokens, validateRerank, type RerankFn, type RerankOptions } from "@/lib/retrieve/rerank";
import type { RankedChunk } from "@/lib/retrieve/rrf";

const usage: LanguageModelUsage = {
  inputTokens: 9000,
  inputTokenDetails: { noCacheTokens: 9000, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokens: 30,
  outputTokenDetails: { textTokens: 30, reasoningTokens: 0 },
  totalTokens: 9030,
};

const candidates: RankedChunk[] = [10, 20, 30, 40].map((id, i) => ({
  id,
  chunkKey: `ai/p#s${id}`,
  headingPath: ["P", `S${id}`],
  anchor: `s${id}`,
  sourceUrl: `https://supabase.com/docs/guides/ai/p#s${id}`,
  content: `Passage ${id}`,
  similarity: 0.6,
  rank: i + 1,
  vectorRank: i + 1,
  keywordRank: null,
}));

const opts: RerankOptions = { model: "gpt-6-luna", topN: 2, maxTokensPerCandidate: 300, reasoning: "low", maxOutputTokens: 1000 };

const replying = (output: unknown): { rerank: RerankFn; prompts: string[] } => {
  const prompts: string[] = [];
  return { prompts, rerank: async (args) => (prompts.push(args.prompt), { output, usage, finishReason: "stop" }) };
};

describe("validateRerank", () => {
  const ids = new Set(["c1", "c2", "c3"]);
  it("accepts known ids in order and cuts extras to topN", () => {
    expect(validateRerank({ ids: ["c3", "c1", "c2"] }, ids, 2)).toEqual({ ids: ["c3", "c1"] });
  });
  it("rejects unknown ids, repeats, an empty list and the wrong shape", () => {
    expect(validateRerank({ ids: ["c9"] }, ids, 2)).toEqual({ error: "unknown id c9" });
    expect(validateRerank({ ids: ["c1", "c1"] }, ids, 2)).toEqual({ error: "id c1 returned twice" });
    expect(validateRerank({ ids: [] }, ids, 2)).toEqual({ error: "no ids returned" });
    expect(validateRerank(null, ids, 2)).toEqual({ error: "output does not match the schema" });
  });
});

describe("rerankChunks", () => {
  it("puts the chosen chunks first, keeps the rest in fused order and logs one ok call", async () => {
    const { rerank, prompts } = replying({ ids: ["c3", "c1"] });
    const { records, sink } = memorySink();
    const r = await rerankChunks("q?", candidates, opts, { rerank, sink, queryId: 5 });
    expect(r.status).toBe("applied");
    expect(r.chunks.map((c) => [c.id, c.rank])).toEqual([
      [30, 1],
      [10, 2],
      [20, 3],
      [40, 4],
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ purpose: "rerank", outcome: "ok", queryId: 5, inputTokens: 9000 });
    expect(prompts[0].indexOf("[c1] P › S10")).toBe(0);
    expect(prompts[0].endsWith("Return at most 2 ids.\n\nQuestion: q?")).toBe(true);
  });

  it("falls back to fused order on an invalid id and logs invalid_output with its tokens", async () => {
    const { records, sink } = memorySink();
    const r = await rerankChunks("q", candidates, opts, { rerank: replying({ ids: ["c7"] }).rerank, sink });
    expect(r).toMatchObject({ status: "skipped", reason: "unknown id c7" });
    expect(r.chunks.map((c) => c.id)).toEqual([10, 20, 30, 40]);
    expect(records[0]).toMatchObject({ outcome: "invalid_output", error: "unknown id c7", inputTokens: 9000 });
  });

  it("falls back on a schema failure that still reports usage", async () => {
    const { records, sink } = memorySink();
    const r = await rerankChunks("q", candidates, opts, { rerank: replying(null).rerank, sink });
    expect(r.status).toBe("skipped");
    expect(records[0]).toMatchObject({ outcome: "invalid_output", inputTokens: 9000 });
  });

  it("falls back on a thrown error and logs api_error", async () => {
    const { records, sink } = memorySink();
    const failing: RerankFn = async () => {
      throw new Error("timeout after 20000ms");
    };
    const r = await rerankChunks("q", candidates, opts, { rerank: failing, sink });
    expect(r).toMatchObject({ status: "skipped", reason: "timeout after 20000ms" });
    expect(r.chunks.map((c) => c.id)).toEqual([10, 20, 30, 40]);
    expect(records[0]).toMatchObject({ outcome: "api_error" });
  });

  it("makes no call with no candidates", async () => {
    const { records, sink } = memorySink();
    expect(await rerankChunks("q", [], opts, { rerank: replying({ ids: [] }).rerank, sink })).toMatchObject({ status: "skipped", chunks: [] });
    expect(records).toHaveLength(0);
  });

  it("maps ids back through the shuffle used in evals", async () => {
    const seed = seedFrom("r01");
    const presentedFirst = shuffled(candidates, seed)[0];
    const { rerank, prompts } = replying({ ids: ["c1"] });
    const { sink } = memorySink();
    const r = await rerankChunks("q", candidates, { ...opts, shuffleSeed: seed }, { rerank, sink });
    expect(r.chunks[0].id).toBe(presentedFirst.id);
    expect(prompts[0].startsWith(`[c1] P › S${presentedFirst.id}`)).toBe(true);
  });
});

describe("helpers", () => {
  it("shuffles reproducibly and keeps every item", () => {
    const a = shuffled([1, 2, 3, 4, 5, 6], 42);
    expect(shuffled([1, 2, 3, 4, 5, 6], 42)).toEqual(a);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seedFrom("r01")).toBe(seedFrom("r01"));
    expect(seedFrom("r01")).not.toBe(seedFrom("r02"));
  });

  it("truncates long passages by tokens", () => {
    expect(truncateTokens("short", 300)).toBe("short");
    expect(truncateTokens("word ".repeat(500), 10).endsWith("…")).toBe(true);
  });

  it("builds the prompt with ids, heading paths and the question last", () => {
    const p = buildRerankPrompt("Why?", [{ id: "c1", chunk: candidates[0] }], { topN: 8, maxTokensPerCandidate: 300 });
    expect(p).toBe("[c1] P › S10\nPassage 10\n\nReturn at most 8 ids.\n\nQuestion: Why?");
  });
});
