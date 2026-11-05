import { describe, expect, it } from "vitest";
import { callCostUsd, PRICES, UnknownModelPriceError } from "@/lib/cost/pricing";

const none = { noCacheInputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
const M = 1_000_000;

describe("callCostUsd", () => {
  it("prices each token class at its own rate", () => {
    expect(callCostUsd("gpt-6-luna", { ...none, noCacheInputTokens: M })).toBe(0.1);
    expect(callCostUsd("gpt-6-luna", { ...none, cachedInputTokens: M })).toBe(0.01);
    expect(callCostUsd("gpt-6-luna", { ...none, cacheWriteTokens: M })).toBe(0.125);
    expect(callCostUsd("gpt-6-luna", { ...none, outputTokens: M })).toBe(0.5);
  });

  it("adds the classes for a typical answer call", () => {
    // 5,000 uncached + 1,000 cached + 400 output on luna
    const cost = callCostUsd("gpt-6-luna", { ...none, noCacheInputTokens: 5000, cachedInputTokens: 1000, outputTokens: 400 });
    expect(cost).toBe(0.00071);
  });

  it("prices the escalation model from its own row", () => {
    expect(callCostUsd("gpt-6.1-sol", { ...none, noCacheInputTokens: 1000, outputTokens: 100 })).toBe(0.003);
  });

  it("prices embeddings on input only and keeps tiny costs", () => {
    expect(callCostUsd("text-embedding-3-small", { ...none, noCacheInputTokens: 100 })).toBe(0.000002);
  });

  it("refuses output tokens on an embedding model", () => {
    expect(() => callCostUsd("text-embedding-3-small", { ...none, outputTokens: 1 })).toThrow(/embedding model/);
  });

  it("throws for a model with no price instead of guessing", () => {
    expect(() => callCostUsd("gpt-unknown", none)).toThrow(UnknownModelPriceError);
  });

  it("prices every model the app is configured to use", () => {
    for (const model of ["gpt-6-luna", "gpt-6.1-sol", "text-embedding-3-small"]) expect(PRICES[model]).toBeDefined();
  });
});
