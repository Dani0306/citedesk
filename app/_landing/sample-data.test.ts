import { describe, expect, it } from "vitest";
import { SAMPLES } from "@/app/_landing/sample-data";

describe("landing sample data", () => {
  it("has uniquely identified samples", () => {
    const ids = SAMPLES.map((s) => s.id);
    expect(SAMPLES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The sticky citation stage is sized for three sources; a different count changes its height.
  it("gives every sample exactly three sources", () => {
    for (const sample of SAMPLES) expect(sample.sources).toHaveLength(3);
  });

  for (const sample of SAMPLES) {
    describe(sample.id, () => {
      it("cites only sources that exist", () => {
        const known = new Set(sample.sources.map((s) => s.n));
        for (const sentence of sample.answer) {
          expect(sentence.cites.length).toBeGreaterThan(0);
          for (const n of sentence.cites) expect(known.has(n)).toBe(true);
        }
      });

      it("numbers sources uniquely", () => {
        const ns = sample.sources.map((s) => s.n);
        expect(new Set(ns).size).toBe(ns.length);
      });

      it("gives every source a page, an anchor and a cited passage", () => {
        for (const s of sample.sources) {
          expect(s.page).toMatch(/^acme\.example\/docs\/[a-z0-9/-]+$/);
          expect(s.anchor).toMatch(/^#[a-z0-9-]+$/);
          expect(s.passage.cited.length).toBeGreaterThan(0);
        }
      });
    });
  }
});
