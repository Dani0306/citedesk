import { describe, expect, it } from "vitest";
import { chooseThreshold, sweepThresholds } from "@/evals/threshold";

const a = (topSimilarity: number | null) => ({ answerable: true, topSimilarity });
const u = (topSimilarity: number | null) => ({ answerable: false, topSimilarity });

describe("threshold sweep", () => {
  it("finds the lowest threshold that separates clean classes", () => {
    // Unanswerable at 0.34–0.50, answerable at 0.66–0.72: every t in (0.50, 0.66] is perfect; the pick is the lowest, 0.51.
    const rows = sweepThresholds([a(0.684), a(0.664), a(0.721), u(0.481), u(0.341), u(0.501)]);
    const best = chooseThreshold(rows);
    expect(best).toEqual({ threshold: 0.51, correctRefusalRate: 1, falseRefusalRate: 0, balancedAccuracy: 1 });
  });

  it("trades off honestly when the classes overlap", () => {
    // A paraphrase scores 0.447, below an unanswerable 0.481: no threshold is perfect.
    const rows = sweepThresholds([a(0.684), a(0.447), u(0.481), u(0.341)]);
    const best = chooseThreshold(rows);
    expect(best.balancedAccuracy).toBeLessThan(1);
    // At 0.35: refuses only u(0.341) → CRR 0.5, FRR 0 → 0.75. At 0.49: refuses 0.447, 0.481, 0.341 → CRR 1, FRR 0.5 → 0.75.
    // Tie broken low.
    expect(best.threshold).toBe(0.35);
    expect(best.balancedAccuracy).toBeCloseTo(0.75, 12);
  });

  it("always refuses a question with no retrieval at all", () => {
    const rows = sweepThresholds([a(0.7), u(null)]);
    expect(rows[0]).toMatchObject({ threshold: 0.3, correctRefusalRate: 1, falseRefusalRate: 0 });
  });

  it("covers 0.30–0.80 in 0.01 steps without float drift, and needs both classes", () => {
    const rows = sweepThresholds([a(0.7), u(0.4)]);
    expect(rows).toHaveLength(51);
    expect(rows.at(-1)!.threshold).toBe(0.8);
    expect(() => sweepThresholds([a(0.7)])).toThrow(/both/);
  });
});
