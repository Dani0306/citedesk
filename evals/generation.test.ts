import type { LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import type { GenerateFn } from "@/lib/answer/answer";
import { memorySink } from "@/lib/calls/sinks";
import type { EmbedFn } from "@/lib/ingest/embed";
import { EMBEDDING_DIMENSIONS } from "@/lib/models";
import type { MatchFn } from "@/lib/retrieve/vector";
import { estimateGenerationUsd, generationConfig, runGeneration } from "@/evals/generation";
import { SpendCapError } from "@/evals/retrieval";
import { GenerationRun, QuestionSet } from "@/evals/schema";

// The fake index answers by question: "low" questions retrieve weakly (refused by the gate at 0.6).
const embed: EmbedFn = async (values) => ({
  embeddings: values.map((v) => Array.from({ length: EMBEDDING_DIMENSIONS }, () => (v.includes("low") ? 0.2 : 0.9))),
  usage: { tokens: 10 },
});
const match: MatchFn = async (embedding) =>
  ["a", "b", "c"].map((key, i) => ({
    id: i + 1,
    chunk_key: `ai/p#${key}`,
    heading_path: ["P", key],
    anchor: key,
    source_url: `https://supabase.com/docs/guides/ai/p#${key}`,
    content: `Passage ${key}.`,
    similarity: embedding[0] > 0.5 ? 0.7 - i * 0.05 : 0.4,
  }));
const usage: LanguageModelUsage = {
  inputTokens: 1000,
  inputTokenDetails: { noCacheTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokens: 40,
  outputTokenDetails: { textTokens: 40, reasoningTokens: 0 },
  totalTokens: 1040,
};
// Answers cite [1] (ai/p#a) and [2] (ai/p#b), plus a made-up [9].
const generate: GenerateFn = async () => ({ text: "It uses a where clause [1]. It is smaller too [2][9].", usage, finishReason: "stop" });

const set = QuestionSet.parse({
  version: 1,
  questions: [
    { id: "r01", question: "first", answerable: true, expected: ["ai/p#a"] },
    { id: "r02", question: "second low", answerable: true, expected: ["ai/p#c"] },
    { id: "u01", question: "unanswerable low", answerable: false, expected: [] },
    { id: "u02", question: "unanswerable but close", answerable: false, expected: [] },
  ],
});
const config = { ...generationConfig("vector", {}), threshold: 0.6 };
let tick = 0;
const now = () => (tick += 100);

describe("runGeneration", () => {
  it("attributes every question to an outcome and counts what the code can check", async () => {
    const { sink } = memorySink();
    const run = await runGeneration(set, "vector", config, { embed, match, generate, sink }, { maxUsd: 1, gitSha: "abc", now });
    expect(GenerationRun.parse(run)).toEqual(run);
    expect(run.perQuestion.map((p) => [p.id, p.outcome])).toEqual([
      ["r01", "answered"],
      ["r02", "false_refusal"],
      ["u01", "correct_refusal"],
      ["u02", "answered_unanswerable"],
    ]);
    const r01 = run.perQuestion[0];
    expect(r01).toMatchObject({ citedChunkKeys: ["ai/p#a", "ai/p#b"], invalidMarkers: [9], retrievedLabelled: true, citedLabelled: true, citationPrecision: 0.5 });
    expect(r01.sentences.map((s) => s.markers)).toEqual([[1], [2, 9]]);
    expect(run.perQuestion[1]).toMatchObject({ refusalReason: "low_score", retrievedLabelled: true, citationPrecision: null, answer: null });
    expect(run.metrics).toMatchObject({
      hallucinatedCitations: 2, // r01 and u02 each cite [9]
      citationPrecision: 0.5, // answered answerable questions only
      correctRefusalRate: 0.5,
      falseRefusalRate: 0.5,
      answered: 2,
    });
  });

  it("stops at the spend cap", async () => {
    const { sink } = memorySink();
    await expect(runGeneration(set, "vector", config, { embed, match, generate, sink }, { maxUsd: 0.00001, gitSha: "x", now })).rejects.toBeInstanceOf(
      SpendCapError,
    );
  });

  it("estimates a worst case that grows with rerank", () => {
    const plain = estimateGenerationUsd(set, config);
    expect(plain).toBeGreaterThan(0);
    expect(estimateGenerationUsd(set, { ...config, rerank: true })).toBeGreaterThan(plain);
    expect(50 * (plain / 4)).toBeLessThan(0.1); // 50 questions fit the default vector cap
  });
});
