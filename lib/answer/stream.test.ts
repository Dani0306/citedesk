import type { LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/answer/answer";
import { streamAnswer, type CiteChunk, type StreamGenerateFn } from "@/lib/answer/stream";
import { memorySink } from "@/lib/calls/sinks";
import type { EmbedFn } from "@/lib/ingest/embed";
import { EMBEDDING_DIMENSIONS } from "@/lib/models";
import type { MatchFn } from "@/lib/retrieve/vector";

const embed: EmbedFn = async (values) => ({
  embeddings: values.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1)),
  usage: { tokens: 9 },
});
const rows =
  (...sims: number[]): MatchFn =>
  async () =>
    sims.map((similarity, i) => ({
      id: 100 + i,
      chunk_key: `database/postgres/indexes#s${i}`,
      heading_path: ["Indexes", `S${i}`],
      anchor: `s${i}`,
      source_url: `https://supabase.com/docs/guides/database/postgres/indexes#s${i}`,
      content: `Chunk ${i} content.`,
      similarity,
    }));
const usage: LanguageModelUsage = {
  inputTokens: 2000,
  inputTokenDetails: { noCacheTokens: 2000, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokens: 50,
  outputTokenDetails: { textTokens: 50, reasoningTokens: 0 },
  totalTokens: 2050,
};

const streamOf = (chunks: CiteChunk[]) =>
  new ReadableStream<CiteChunk>({
    start(c) {
      for (const chunk of chunks) c.enqueue(chunk);
      c.close();
    },
  });

/** Streams `text` in two deltas, the way the model would. */
const speaking = (text: string): StreamGenerateFn => () => ({
  chunks: streamOf([
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: text.slice(0, 5) },
    { type: "text-delta", id: "t", delta: text.slice(5) },
    { type: "text-end", id: "t" },
  ]),
  done: Promise.resolve({ text, usage, finishReason: "stop" }),
});

const silent: StreamGenerateFn = () => {
  throw new Error("the answer model must not be called");
};

const config = { ...defaultConfig({}), threshold: 0.6 };
const run = async (streamGenerate: StreamGenerateFn, match: MatchFn) => {
  const out: CiteChunk[] = [];
  const { records, sink } = memorySink();
  const result = await streamAnswer("How do I create a partial index?", { embed, match, sink, streamGenerate }, config, (c) => out.push(c));
  return { out, records, result };
};

describe("streamAnswer", () => {
  it("sends every source before the first text delta, and the citation check last", async () => {
    const { out, records, result } = await run(speaking("Use a where clause [1]. Also [7]."), rows(0.7, 0.5));
    const types = out.map((c) => c.type);
    expect(types[0]).toBe("start");
    const firstDelta = types.indexOf("text-delta");
    expect(types.lastIndexOf("source-url")).toBeLessThan(firstDelta);
    expect(types.lastIndexOf("data-passage")).toBeLessThan(firstDelta);
    expect(types.at(-1)).toBe("data-citations");
    expect(types).not.toContain("finish"); // the route adds it after logging

    expect(out.filter((c) => c.type === "source-url")).toEqual([
      { type: "source-url", sourceId: "1", url: "https://supabase.com/docs/guides/database/postgres/indexes#s0", title: "Indexes › S0" },
      { type: "source-url", sourceId: "2", url: "https://supabase.com/docs/guides/database/postgres/indexes#s1", title: "Indexes › S1" },
    ]);
    expect(out.at(-1)).toEqual({ type: "data-citations", id: "citations", data: { cited: [1], invalid: [7], uncitedSentences: 0 } });
    expect(result.kind).toBe("answer");
    expect(records.map((r) => [r.purpose, r.outcome, r.inputTokens])).toEqual([
      ["embed_query", "ok", 9],
      ["answer", "ok", 2000],
    ]);
  });

  it("refuses on a low score with a short text and the closest section, never calling the model", async () => {
    const { out, records, result } = await run(silent, rows(0.45));
    expect(out.map((c) => c.type)).toEqual(["start", "text-start", "text-delta", "text-end", "data-refusal"]);
    expect(out.at(-1)).toMatchObject({
      type: "data-refusal",
      data: { reason: "low_score", closest: { title: "Indexes › S0", url: "https://supabase.com/docs/guides/database/postgres/indexes#s0", similarity: 0.45 } },
    });
    expect(result).toMatchObject({ kind: "refusal", reason: "low_score" });
    expect(records.map((r) => r.purpose)).toEqual(["embed_query"]);
  });

  it("turns the model's own I don't know into a refusal part after the streamed text", async () => {
    const { out, result } = await run(speaking("I don't know."), rows(0.7));
    expect(out.at(-1)).toMatchObject({ type: "data-refusal", data: { reason: "not_in_sources" } });
    expect(result).toMatchObject({ kind: "refusal", reason: "not_in_sources" });
  });

  it("logs a failed stream as api_error and throws", async () => {
    const failing: StreamGenerateFn = () => ({
      chunks: streamOf([{ type: "error", errorText: "upstream 500" }]),
      done: new Promise(() => {}),
    });
    const out: CiteChunk[] = [];
    const { records, sink } = memorySink();
    await expect(streamAnswer("q", { embed, match: rows(0.7), sink, streamGenerate: failing }, config, (c) => out.push(c))).rejects.toThrow(
      "upstream 500",
    );
    expect(records.at(-1)).toMatchObject({ purpose: "answer", outcome: "api_error", error: "upstream 500" });
  });
});
