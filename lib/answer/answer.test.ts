import type { LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { answerQuestion, defaultConfig, type GenerateFn } from "@/lib/answer/answer";
import { memorySink } from "@/lib/calls/sinks";
import type { EmbedFn } from "@/lib/ingest/embed";
import { EMBEDDING_DIMENSIONS } from "@/lib/models";
import type { MatchFn } from "@/lib/retrieve/vector";

const embed: EmbedFn = async (values) => ({
  embeddings: values.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1)),
  usage: { tokens: 9 },
});

const rows = (...sims: number[]): MatchFn =>
  async () =>
    sims.map((similarity, i) => ({
      id: 100 + i,
      chunk_key: `database/postgres/indexes#s${i}`,
      heading_path: ["Indexes", `S${i}`],
      anchor: `s${i}`,
      source_url: `https://supabase.com/docs/guides/database/postgres/indexes#s${i}`,
      content: `Chunk ${i}`,
      similarity,
    }));

const usage: LanguageModelUsage = {
  inputTokens: 2000,
  inputTokenDetails: { noCacheTokens: 2000, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokens: 120,
  outputTokenDetails: { textTokens: 80, reasoningTokens: 40 },
  totalTokens: 2120,
};

const replying = (text: string): { generate: GenerateFn; prompts: string[] } => {
  const prompts: string[] = [];
  return {
    prompts,
    generate: async (args) => {
      prompts.push(args.prompt);
      return { text, usage, finishReason: "stop" };
    },
  };
};

const neverCalled: GenerateFn = async () => {
  throw new Error("the answer model must not be called");
};

const config = { ...defaultConfig({}), threshold: 0.6 };

describe("answerQuestion", () => {
  it("answers, validates the markers and logs both calls", async () => {
    const { generate, prompts } = replying("Use a where clause [1]. It is smaller [2][9].");
    const { records, sink } = memorySink();
    const r = await answerQuestion(" How do I create a partial index? ", { embed, match: rows(0.68, 0.5), generate, sink }, config);

    expect(r.kind).toBe("answer");
    if (r.kind !== "answer") return;
    expect(r.question).toBe("How do I create a partial index?");
    expect(r.citations.cited).toEqual([
      { n: 1, chunkId: 100 },
      { n: 2, chunkId: 101 },
    ]);
    expect(r.citations.invalid).toEqual([9]);
    expect(prompts[0]).toContain('<source id="2" title="Indexes › S1">');
    expect(records.map((x) => [x.purpose, x.outcome])).toEqual([
      ["embed_query", "ok"],
      ["answer", "ok"],
    ]);
    expect(records[1]).toMatchObject({ model: config.answerModel, inputTokens: 2000, outputTokens: 120, reasoningTokens: 40 });
  });

  it("refuses on a low top score without calling the answer model", async () => {
    const { records, sink } = memorySink();
    const r = await answerQuestion("How do I set up TOTP MFA?", { embed, match: rows(0.48, 0.4), generate: neverCalled, sink }, config);
    expect(r).toMatchObject({ kind: "refusal", reason: "low_score", closest: { chunkKey: "database/postgres/indexes#s0", similarity: 0.48 } });
    expect(records.map((x) => x.purpose)).toEqual(["embed_query"]);
  });

  it("refuses with no closest section when retrieval returns nothing", async () => {
    const { sink } = memorySink();
    const r = await answerQuestion("q", { embed, match: rows(), generate: neverCalled, sink }, config);
    expect(r).toMatchObject({ kind: "refusal", reason: "no_matches", closest: null });
  });

  it("turns the model's exact I don't know into a not_in_sources refusal", async () => {
    const { records, sink } = memorySink();
    const r = await answerQuestion("q", { embed, match: rows(0.7), generate: replying("I don't know.").generate, sink }, config);
    expect(r).toMatchObject({ kind: "refusal", reason: "not_in_sources" });
    expect(records.map((x) => x.purpose)).toEqual(["embed_query", "answer"]);
  });

  it("logs a failed answer call as api_error and rethrows", async () => {
    const { records, sink } = memorySink();
    const failing: GenerateFn = async () => {
      throw new Error("rate limited");
    };
    await expect(answerQuestion("q", { embed, match: rows(0.7), generate: failing, sink }, config)).rejects.toThrow("rate limited");
    expect(records.at(-1)).toMatchObject({ purpose: "answer", outcome: "api_error", error: "rate limited" });
  });

  it("rejects an empty question before spending anything", async () => {
    const { records, sink } = memorySink();
    await expect(answerQuestion("   ", { embed, match: rows(0.7), generate: neverCalled, sink }, config)).rejects.toThrow();
    expect(records).toHaveLength(0);
  });
});
