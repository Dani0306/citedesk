import type { LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { defaultConfig, type GenerateFn } from "@/lib/answer/answer";
import { memorySink } from "@/lib/calls/sinks";
import type { EmbedFn } from "@/lib/ingest/embed";
import { EMBEDDING_DIMENSIONS } from "@/lib/models";
import type { MatchFn } from "@/lib/retrieve/vector";
import { breakEven, CacheRun, runCache } from "@/evals/cache";

describe("breakEven", () => {
  it("is (U − O) / (U − R): the repeat share where both modes cost the same", () => {
    // U = 1.25, R = 0.1, O = 1.0 (the price ratios): r* = 0.25 / 1.15.
    expect(breakEven(1.25, 0.1, 1)).toBeCloseTo(0.25 / 1.15, 12);
    // Check: at r*, (1 − r)·U + r·R equals O.
    const r = breakEven(1.25, 0.1, 1)!;
    expect((1 - r) * 1.25 + r * 0.1).toBeCloseTo(1, 12);
  });

  it("is 0 when implicit is never dearer, and undefined when repeats aren't cheaper", () => {
    expect(breakEven(0.9, 0.1, 1)).toBe(0);
    expect(breakEven(1, 1, 1)).toBeNull();
  });
});

describe("runCache", () => {
  const embed: EmbedFn = async (values) => ({ embeddings: values.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1)), usage: { tokens: 10 } });
  const match: MatchFn = async () => [
    { id: 1, chunk_key: "ai/p#a", heading_path: ["P"], anchor: "a", source_url: "https://supabase.com/docs/guides/ai/p#a", content: "c", similarity: 0.7 },
  ];
  // A fake provider that behaves like the real one: implicit writes on a first ask and reads on a repeat; off does neither.
  const seen = new Set<string>();
  const generate: GenerateFn = async ({ prompt, cacheMode }) => {
    const repeat = seen.has(prompt);
    if (cacheMode === "implicit") seen.add(prompt);
    const usage: LanguageModelUsage = {
      inputTokens: 1000,
      inputTokenDetails:
        cacheMode === "off" ? { noCacheTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 } : repeat ? { noCacheTokens: 0, cacheReadTokens: 1000, cacheWriteTokens: 0 } : { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 1000 },
      outputTokens: 0,
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
      totalTokens: 1000,
    };
    return { text: "A [1].", usage, finishReason: "stop" };
  };

  it("measures U, R and O and their break-even from the calls it made", async () => {
    const { sink } = memorySink();
    const run = await runCache("vector", { ...defaultConfig({}), threshold: 0.6 }, { embed, match, generate, sink }, { maxUsd: 1, gitSha: "x", questions: ["q1", "q2"] });
    expect(CacheRun.parse(run)).toEqual(run);
    expect(run.passes.map((p) => [p.pass, p.cacheWriteShare, p.cacheReadShare])).toEqual([
      ["implicit-first", 1, 0],
      ["implicit-repeat", 0, 1],
      ["off", 0, 0],
    ]);
    // luna per 1M: write 0.125, read 0.01, input 0.10; plus a $0.0000002 embedding each question.
    expect(run.U).toBeCloseTo(0.000125 + 0.0000002, 10);
    expect(run.R).toBeCloseTo(0.00001 + 0.0000002, 10);
    expect(run.O).toBeCloseTo(0.0001 + 0.0000002, 10);
    expect(run.breakEvenRepeatShare).toBeCloseTo(0.000025 / 0.000115, 6);
    expect(run.warning).toBeNull();
  });
});
