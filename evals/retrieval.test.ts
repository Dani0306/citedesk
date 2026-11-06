import { describe, expect, it } from "vitest";
import { memorySink } from "@/lib/calls/sinks";
import type { EmbedFn } from "@/lib/ingest/embed";
import { EMBEDDING_DIMENSIONS } from "@/lib/models";
import type { MatchFn } from "@/lib/retrieve/vector";
import { CONFIGS } from "@/evals/configs";
import { estimateRetrievalCostUsd, runRetrieval, SpendCapError } from "@/evals/retrieval";
import { QuestionSet, RetrievalRun } from "@/evals/schema";

const embed: EmbedFn = async (values) => ({
  embeddings: values.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1)),
  usage: { tokens: 1_000_000 }, // $0.02 per call, so the cap is easy to hit
});

// The fake index always ranks keys a, b, a, c.
const match: MatchFn = async () =>
  ["a", "b", "a", "c"].map((key, i) => ({
    id: i + 1,
    chunk_key: `ai/p#${key}`,
    heading_path: ["P", key],
    anchor: key,
    source_url: `https://supabase.com/docs/guides/ai/p#${key}`,
    content: key,
    similarity: 0.9 - i * 0.1,
  }));

const set = QuestionSet.parse({
  version: 1,
  questions: [
    { id: "r01", question: "first", answerable: true, expected: ["ai/p#a"] },
    { id: "r02", question: "second", answerable: true, expected: ["https://supabase.com/docs/guides/ai/p#c"], tags: ["paraphrase"] },
    { id: "u01", question: "out of scope", answerable: false, expected: [] },
  ],
});

let tick = 0;
const now = () => (tick += 100);

describe("runRetrieval", () => {
  it("scores answerable questions, skips unanswerable ones and returns a valid run file", async () => {
    const { records, sink } = memorySink();
    const run = await runRetrieval(set, CONFIGS.vector, { embed, match, sink }, { maxUsd: 1, gitSha: "abc123", now, date: new Date("2026-11-06T12:00:00Z") });

    expect(RetrievalRun.parse(run)).toEqual(run);
    expect(run).toMatchObject({ questionCount: 2, skippedUnanswerable: 1, gitSha: "abc123", config: { name: "vector", k: 20 } });
    expect(run.perQuestion.map((r) => [r.id, r.firstRelevantRank, r.expected[0]])).toEqual([
      ["r01", 1, "ai/p#a"],
      ["r02", 4, "ai/p#c"],
    ]);
    expect(run.metrics.mrr).toBeCloseTo((1 + 1 / 4) / 2, 10);
    expect(run.perQuestion[1].stage.retrieval).toEqual({ retrievedLabelledAt5: true, retrievedLabelledAt8: true, retrievedLabelledAt20: true });
    expect(records).toHaveLength(2);
    expect(run.costUsd).toBeCloseTo(0.04, 8);
    expect(run.costPerQueryUsd).toBeCloseTo(0.02, 8);
  });

  it("stops at the spend cap before returning a run", async () => {
    const { sink } = memorySink();
    await expect(runRetrieval(set, CONFIGS.vector, { embed, match, sink }, { maxUsd: 0.03, gitSha: "x", now })).rejects.toBeInstanceOf(SpendCapError);
  });
});

describe("estimateRetrievalCostUsd", () => {
  it("prices only the answerable questions' tokens", () => {
    expect(estimateRetrievalCostUsd(set)).toBeGreaterThan(0);
    expect(estimateRetrievalCostUsd(set)).toBeLessThan(0.000001);
  });
});
