import { describe, expect, it } from "vitest";
import { agreementStats, confusion } from "@/evals/agreement";
import type { GroundednessLabel } from "@/evals/schema";

const S: GroundednessLabel = "supported";
const U: GroundednessLabel = "unsupported";
const N: GroundednessLabel = "no_claim";

// Every expected value is worked out by hand from the matrix marginals.
describe("agreement and Cohen's kappa", () => {
  it("scores a judge that always says supported at 90% agreement and kappa 0", () => {
    // Humans: 9 supported, 1 unsupported. po = 0.9; pe = 0.9·1 + 0.1·0 = 0.9; κ = 0.
    const pairs = [...Array.from({ length: 9 }, () => [S, S] as [GroundednessLabel, GroundednessLabel]), [U, S] as [GroundednessLabel, GroundednessLabel]];
    const stats = agreementStats(confusion(pairs));
    expect(stats.agreement).toBeCloseTo(0.9, 12);
    expect(stats.kappa).toBeCloseTo(0, 12);
  });

  it("matches a three-label table worked out by hand", () => {
    // Human s,s,s,u,u,n vs judge s,s,u,u,s,n: po = 4/6. Marginals human s3 u2 n1, judge s3 u2 n1:
    // pe = (9 + 4 + 1) / 36 = 14/36. κ = (24/36 − 14/36) / (22/36) = 10/22.
    const m = confusion([
      [S, S],
      [S, S],
      [S, U],
      [U, U],
      [U, S],
      [N, N],
    ]);
    expect(m.supported).toEqual({ supported: 2, unsupported: 1, no_claim: 0 });
    expect(m.unsupported).toEqual({ supported: 1, unsupported: 1, no_claim: 0 });
    const stats = agreementStats(m);
    expect(stats).toMatchObject({ sentences: 6 });
    expect(stats.agreement).toBeCloseTo(4 / 6, 12);
    expect(stats.kappa).toBeCloseTo(10 / 22, 12);
  });

  it("gives perfect agreement kappa 1, and leaves kappa undefined when both used one label only", () => {
    expect(agreementStats(confusion([[S, S], [U, U]])).kappa).toBeCloseTo(1, 12);
    expect(agreementStats(confusion([[S, S], [S, S]]))).toEqual({ sentences: 2, agreement: 1, kappa: null });
  });

  it("has nothing to say about zero sentences", () => {
    expect(agreementStats(confusion([]))).toEqual({ sentences: 0, agreement: null, kappa: null });
  });
});
