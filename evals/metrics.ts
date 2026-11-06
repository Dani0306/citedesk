import type { Metrics } from "./schema";

// Retrieval metrics (T19), binary relevance. `ranked` is the chunk_key of each retrieved chunk in
// rank order, duplicates included: a long section split into several chunks appears more than
// once, and ranks stay chunk positions because that is what the answer model sees. Each expected
// key is credited once, at its first position, so a split section can't score twice.

/** Distinct expected keys in the top k ÷ number of expected keys. */
export function recallAt(ranked: string[], expected: Set<string>, k: number): number {
  const found = new Set(ranked.slice(0, k).filter((key) => expected.has(key)));
  return found.size / expected.size;
}

/** 1-based rank of the first relevant chunk within the top k, or null. */
export function firstRelevantRank(ranked: string[], expected: Set<string>, k = ranked.length): number | null {
  const i = ranked.slice(0, k).findIndex((key) => expected.has(key));
  return i === -1 ? null : i + 1;
}

/** 1 ÷ rank of the first relevant chunk within the top k; 0 when there is none. */
export function reciprocalRank(ranked: string[], expected: Set<string>, k: number): number {
  const rank = firstRelevantRank(ranked, expected, k);
  return rank === null ? 0 : 1 / rank;
}

/** DCG of the top k with gain 1 for each expected key's first chunk, over the ideal DCG. */
export function ndcgAt(ranked: string[], expected: Set<string>, k: number): number {
  const credited = new Set<string>();
  let dcg = 0;
  ranked.slice(0, k).forEach((key, i) => {
    if (expected.has(key) && !credited.has(key)) {
      credited.add(key);
      dcg += 1 / Math.log2(i + 2);
    }
  });
  let ideal = 0;
  for (let i = 0; i < Math.min(expected.size, k); i++) ideal += 1 / Math.log2(i + 2);
  return dcg / ideal;
}

export function scoreQuestion(ranked: string[], expectedKeys: string[]) {
  const expected = new Set(expectedKeys);
  if (expected.size === 0) throw new Error("An answerable question needs at least one expected key");
  const metrics: Metrics = {
    recallAt5: recallAt(ranked, expected, 5),
    recallAt8: recallAt(ranked, expected, 8),
    recallAt20: recallAt(ranked, expected, 20),
    mrr: reciprocalRank(ranked, expected, 20),
    ndcgAt10: ndcgAt(ranked, expected, 10),
  };
  return {
    metrics,
    firstRelevantRank: firstRelevantRank(ranked, expected, 20),
    stage: {
      retrievedLabelledAt5: firstRelevantRank(ranked, expected, 5) !== null,
      retrievedLabelledAt8: firstRelevantRank(ranked, expected, 8) !== null,
      retrievedLabelledAt20: firstRelevantRank(ranked, expected, 20) !== null,
    },
  };
}

/** Macro-average: every question counts the same, however many sections it expects. */
export function aggregate(all: Metrics[]): Metrics {
  if (all.length === 0) throw new Error("Nothing to aggregate");
  const mean = (pick: (m: Metrics) => number) => all.reduce((sum, m) => sum + pick(m), 0) / all.length;
  return {
    recallAt5: mean((m) => m.recallAt5),
    recallAt8: mean((m) => m.recallAt8),
    recallAt20: mean((m) => m.recallAt20),
    mrr: mean((m) => m.mrr),
    ndcgAt10: mean((m) => m.ndcgAt10),
  };
}

/** Nearest-rank percentile (p in 0..1) of a non-empty list. */
export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}
