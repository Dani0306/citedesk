import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LanguageModelUsage } from "ai";
import { describe, expect, it, vi } from "vitest";
import {
  buildRecord,
  fromEmbedding,
  fromText,
  type ModelCallRecord,
  NO_TOKENS,
  recordCall,
  usageFromEmbedding,
  usageFromLanguageModel,
} from "@/lib/calls/record";
import { dbSink, jsonlSink, toRow } from "@/lib/calls/sinks";
import { UnknownModelPriceError } from "@/lib/cost/pricing";
import { DbError } from "@/lib/db/result";

const usage = (u: Partial<LanguageModelUsage>): LanguageModelUsage => ({
  inputTokens: undefined,
  inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
  outputTokens: undefined,
  outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
  totalTokens: undefined,
  ...u,
});

function memorySink() {
  const records: ModelCallRecord[] = [];
  return { records, sink: async (r: ModelCallRecord) => void records.push(r) };
}

// A fake clock: each call advances 250 ms.
const clock = () => {
  let t = 1000;
  return () => (t += 250);
};

describe("usage extraction", () => {
  it("reads every token class the SDK reports", () => {
    const tokens = usageFromLanguageModel(
      usage({
        inputTokens: 6000,
        inputTokenDetails: { noCacheTokens: 4000, cacheReadTokens: 1500, cacheWriteTokens: 500 },
        outputTokens: 400,
        outputTokenDetails: { textTokens: 300, reasoningTokens: 100 },
      }),
    );
    expect(tokens).toEqual({
      inputTokens: 6000,
      noCacheInputTokens: 4000,
      cachedInputTokens: 1500,
      cacheWriteTokens: 500,
      outputTokens: 400,
      reasoningTokens: 100,
    });
  });

  it("derives uncached input when the provider omits it", () => {
    const tokens = usageFromLanguageModel(
      usage({ inputTokens: 6000, inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: 1500, cacheWriteTokens: 500 } }),
    );
    expect(tokens.noCacheInputTokens).toBe(4000);
  });

  it("treats missing fields as zero", () => {
    expect(usageFromLanguageModel(usage({}))).toEqual(NO_TOKENS);
  });

  it("maps embedding usage to uncached input", () => {
    expect(usageFromEmbedding({ tokens: 120 })).toEqual({ ...NO_TOKENS, inputTokens: 120, noCacheInputTokens: 120 });
    expect(fromEmbedding({ usage: { tokens: 120 } }).raw).toBeNull();
  });
});

describe("recordCall", () => {
  it("writes one priced record for a successful call and returns its result", async () => {
    const { records, sink } = memorySink();
    const result = { text: "hi", usage: usage({ inputTokens: 1000, outputTokens: 100, raw: { input_tokens: 1000 } }) };
    const out = await recordCall(sink, { purpose: "answer", model: "gpt-6-luna" }, async () => result, fromText, clock());

    expect(out).toBe(result);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      purpose: "answer",
      model: "gpt-6-luna",
      outcome: "ok",
      inputTokens: 1000,
      outputTokens: 100,
      costUsd: 0.00015,
      latencyMs: 250,
      error: null,
      queryId: null,
      rawUsage: { input_tokens: 1000 },
    });
  });

  it("logs a failed call as api_error, then re-throws", async () => {
    const { records, sink } = memorySink();
    const failing = () => Promise.reject(new Error("429 rate limited"));
    await expect(recordCall(sink, { purpose: "rerank", model: "gpt-6-luna", queryId: 7 }, failing, fromText, clock())).rejects.toThrow(
      "429 rate limited",
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ outcome: "api_error", error: "429 rate limited", costUsd: 0, inputTokens: 0, queryId: 7 });
  });

  it("refuses an unpriced model before making the call", async () => {
    const { records, sink } = memorySink();
    const run = vi.fn(async () => ({ usage: usage({}) }));
    await expect(recordCall(sink, { purpose: "answer", model: "gpt-unknown" }, run, fromText)).rejects.toThrow(UnknownModelPriceError);
    expect(run).not.toHaveBeenCalled();
    expect(records).toHaveLength(0);
  });
});

describe("sinks", () => {
  const record = buildRecord({ purpose: "embed_query", model: "text-embedding-3-small" }, usageFromEmbedding({ tokens: 12 }), {
    outcome: "ok",
    latencyMs: 31.6,
    at: new Date("2026-11-05T12:00:00Z"),
  });

  it("maps a record to a model_calls row", () => {
    expect(toRow(record)).toMatchObject({
      created_at: "2026-11-05T12:00:00.000Z",
      purpose: "embed_query",
      input_tokens: 12,
      cost_usd: 0.00000024,
      latency_ms: 32,
      raw_usage: null,
    });
  });

  it("appends one JSON line per record", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "citedesk-calls-"));
    try {
      const file = path.join(dir, "logs", "model-calls.jsonl");
      await jsonlSink(file)(record);
      await jsonlSink(file)(record);
      const lines = readFileSync(file, "utf8").trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toMatchObject({ model: "text-embedding-3-small", inputTokens: 12 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws when the database rejects the insert", async () => {
    const client = {
      from: () => ({ insert: async () => ({ data: null, error: { message: "permission denied", code: "42501" } }) }),
    };
    await expect(dbSink(client)(record)).rejects.toThrow(DbError);
  });
});
