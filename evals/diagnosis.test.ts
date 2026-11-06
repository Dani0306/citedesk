import { describe, expect, it } from "vitest";
import { diagnose } from "@/evals/diagnosis";
import type { GenerationQuestion, GenerationRun, JudgeRun } from "@/evals/schema";

const q = (id: string, outcome: GenerationQuestion["outcome"], retrievedLabelled: boolean | null): GenerationQuestion => ({
  id,
  question: id,
  answerable: outcome === "answered" || outcome === "false_refusal",
  tags: [],
  expected: [],
  outcome,
  refusalReason: null,
  topVectorSimilarity: 0.7,
  answer: outcome.startsWith("answered") ? "x" : null,
  sentences: [],
  sources: [],
  citedChunkKeys: [],
  invalidMarkers: [],
  citationPrecision: null,
  retrievedLabelled,
  citedLabelled: null,
  rerankStatus: "off",
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  latencyMs: 0,
});

const gen = {
  perQuestion: [
    q("hg", "answered", true),
    q("hu", "answered", true),
    q("mg", "answered", false),
    q("mu", "answered", false),
    q("nj", "answered", true),
    q("fr", "false_refusal", true),
    q("cr", "correct_refusal", null),
    q("au", "answered_unanswerable", null),
  ],
} as GenerationRun;

const s = (questionId: string, judge: "supported" | "unsupported" | "no_claim" | null) => ({ questionId, index: 0, textHash: "h", human: "supported" as const, judge, reason: null });
const judge = {
  sentences: [s("hg", "supported"), s("hg", "no_claim"), s("hu", "supported"), s("hu", "unsupported"), s("mg", "supported"), s("mu", "unsupported"), s("nj", null)],
} as JudgeRun;

describe("diagnose", () => {
  it("puts every question in exactly one place and attributes each failure to a stage", () => {
    const d = diagnose(gen, judge);
    expect(d.cells).toEqual({ hitGrounded: 1, hitUngrounded: 1, missGrounded: 1, missUngrounded: 1 });
    expect(d).toMatchObject({ unjudged: 1, falseRefusals: 1, correctRefusals: 1, answeredUnanswerable: 1 });
    expect(d.perQuestion).toHaveLength(gen.perQuestion.length);
    expect(d.perQuestion.find((p) => p.id === "mg")?.cell).toBe("missGrounded");
  });

  it("leaves every answered question unjudged without a judge run", () => {
    const d = diagnose(gen, null);
    expect(d.unjudged).toBe(5);
    expect(Object.values(d.cells).every((n) => n === 0)).toBe(true);
  });
});
