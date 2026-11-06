import { describe, expect, it } from "vitest";
import { aggregate, ndcgAt, percentile, recallAt, reciprocalRank, scoreQuestion } from "@/evals/metrics";

const E = (...keys: string[]) => new Set(keys);

// Every expected value below is computed by hand: DCG gains are 1 / log2(rank + 1).
describe("retrieval metrics", () => {
  it("scores a perfect ranking as 1 everywhere", () => {
    const { metrics, firstRelevantRank } = scoreQuestion(["a", "x", "y"], ["a"]);
    expect(metrics).toEqual({ recallAt5: 1, recallAt8: 1, recallAt20: 1, mrr: 1, ndcgAt10: 1 });
    expect(firstRelevantRank).toBe(1);
  });

  it("scores a miss as 0 everywhere, with no rank", () => {
    const r = scoreQuestion(["x", "y", "z"], ["a"]);
    expect(r.metrics).toEqual({ recallAt5: 0, recallAt8: 0, recallAt20: 0, mrr: 0, ndcgAt10: 0 });
    expect(r.firstRelevantRank).toBeNull();
    expect(r.stage.retrievedLabelledAt20).toBe(false);
  });

  it("gives a hit at rank 3 an MRR of 1/3 and an nDCG of 1/log2(4) = 0.5", () => {
    expect(reciprocalRank(["x", "y", "a"], E("a"), 20)).toBeCloseTo(1 / 3, 10);
    expect(ndcgAt(["x", "y", "a"], E("a"), 10)).toBeCloseTo(0.5, 10);
  });

  it("handles two expected sections at ranks 1 and 4", () => {
    const ranked = ["a", "x", "y", "b", "z"];
    expect(recallAt(ranked, E("a", "b"), 3)).toBe(0.5);
    expect(recallAt(ranked, E("a", "b"), 5)).toBe(1);
    // (1 + 1/log2 5) / (1 + 1/log2 3) = 1.430677 / 1.630930
    expect(ndcgAt(ranked, E("a", "b"), 10)).toBeCloseTo(0.877215, 6);
  });

  it("credits a split section once, so nDCG stays at or below 1", () => {
    // a at ranks 1 and 2, b at 3: (1 + 1/log2 4) / (1 + 1/log2 3) = 1.5 / 1.630930
    expect(ndcgAt(["a", "a", "b"], E("a", "b"), 10)).toBeCloseTo(0.919721, 6);
    expect(recallAt(["a", "a", "a", "a", "a"], E("a", "b"), 5)).toBe(0.5);
  });

  it("ignores hits beyond the cut-off", () => {
    const ranked = [...Array.from({ length: 20 }, (_, i) => `x${i}`), "a"];
    expect(scoreQuestion(ranked, ["a"]).metrics.mrr).toBe(0);
    expect(ndcgAt(["x0", "x1", "a"], E("a"), 2)).toBe(0);
  });

  it("rejects an answerable question with no expected keys", () => {
    expect(() => scoreQuestion(["a"], [])).toThrow(/at least one expected key/);
  });
});

describe("aggregate and percentile", () => {
  it("macro-averages per question", () => {
    const one = { recallAt5: 1, recallAt8: 1, recallAt20: 1, mrr: 1, ndcgAt10: 1 };
    const zero = { recallAt5: 0, recallAt8: 0, recallAt20: 0, mrr: 0, ndcgAt10: 0 };
    expect(aggregate([one, zero, zero, one])).toEqual({ recallAt5: 0.5, recallAt8: 0.5, recallAt20: 0.5, mrr: 0.5, ndcgAt10: 0.5 });
  });

  it("uses nearest-rank percentiles", () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(values, 0.5)).toBe(10);
    expect(percentile(values, 0.95)).toBe(19);
    expect(percentile([7], 0.95)).toBe(7);
  });
});
