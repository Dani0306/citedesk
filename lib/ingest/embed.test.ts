import { describe, expect, it } from "vitest";
import type { ModelCallRecord } from "@/lib/calls/record";
import { embedAll, type EmbedFn } from "@/lib/ingest/embed";
import { EMBEDDING_DIMENSIONS } from "@/lib/models";

const vec = (x: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, () => x);

function fakeEmbed(dims = EMBEDDING_DIMENSIONS): { embed: EmbedFn; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    embed: async (values) => {
      calls.push(values);
      return { embeddings: values.map((_, i) => Array.from({ length: dims }, () => i)), usage: { tokens: values.length * 10 } };
    },
  };
}

function memorySink() {
  const records: ModelCallRecord[] = [];
  return { records, sink: async (r: ModelCallRecord) => void records.push(r) };
}

describe("embedAll", () => {
  it("batches, keeps order, and logs one priced call per batch", async () => {
    const { embed, calls } = fakeEmbed();
    const { records, sink } = memorySink();
    const texts = Array.from({ length: 5 }, (_, i) => `t${i}`);
    const out = await embedAll(texts, { embed, sink, batchSize: 2 });

    expect(calls).toEqual([["t0", "t1"], ["t2", "t3"], ["t4"]]);
    expect(out).toHaveLength(5);
    expect(out[2]).toEqual(vec(0)); // first of the second batch
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ purpose: "embed_document", model: "text-embedding-3-small", inputTokens: 20, outcome: "ok" });
    expect(records[0].costUsd).toBe(0.0000004);
  });

  it("refuses vectors of the wrong dimension before anything is written", async () => {
    const { embed } = fakeEmbed(512);
    const { sink } = memorySink();
    await expect(embedAll(["a"], { embed, sink })).rejects.toThrow(/512 dimensions/);
  });

  it("refuses a short response", async () => {
    const { sink } = memorySink();
    const embed: EmbedFn = async () => ({ embeddings: [vec(1)], usage: { tokens: 1 } });
    await expect(embedAll(["a", "b"], { embed, sink })).rejects.toThrow(/Asked for 2/);
  });
});
