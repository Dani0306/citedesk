import { describe, expect, it } from "vitest";
import { SAMPLE_ANSWER, SAMPLE_SOURCES } from "@/app/_landing/sample-data";

describe("landing sample data", () => {
  it("cites only sources that exist", () => {
    const known = new Set(SAMPLE_SOURCES.map((s) => s.n));
    for (const sentence of SAMPLE_ANSWER) {
      expect(sentence.cites.length).toBeGreaterThan(0);
      for (const n of sentence.cites) expect(known.has(n)).toBe(true);
    }
  });

  it("numbers sources uniquely", () => {
    const ns = SAMPLE_SOURCES.map((s) => s.n);
    expect(new Set(ns).size).toBe(ns.length);
  });

  it("gives every source an anchor and a cited passage", () => {
    for (const s of SAMPLE_SOURCES) {
      expect(s.anchor).toMatch(/^#[a-z0-9-]+$/);
      expect(s.passage.cited.length).toBeGreaterThan(0);
    }
  });
});
