import type { LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { memorySink } from "@/lib/calls/sinks";
import type { EmbedFn } from "@/lib/ingest/embed";
import { EMBEDDING_DIMENSIONS } from "@/lib/models";
import type { KeywordFn } from "@/lib/retrieve/keyword";
import type { RerankFn } from "@/lib/retrieve/rerank";
import type { MatchFn } from "@/lib/retrieve/vector";
import { makeConfigs, type RetrievalDeps } from "@/evals/configs";
import { runRetrieval, SpendCapError } from "@/evals/retrieval";
import { QuestionSet, RetrievalRun } from "@/evals/schema";

const embed: EmbedFn = async (values) => ({
  embeddings: values.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1)),
  usage: { tokens: 1_000_000 }, // $0.02 per call, so the cap is easy to hit
});

const row = (key: string, i: number) => ({
  id: i + 1,
  chunk_key: `ai/p#${key}`,
  heading_path: ["P", key],
  anchor: key,
  source_url: `https://supabase.com/docs/guides/ai/p#${key}`,
  content: key,
  similarity: 0.9 - i * 0.1,
});
// The fake vector index always ranks keys a, b, a, c (ids 1–4); the keyword arm finds nothing.
const match: MatchFn = async () => ["a", "b", "a", "c"].map(row);
const keyword: KeywordFn = async () => [];
const usage: LanguageModelUsage = {
  inputTokens: 100,
  inputTokenDetails: { noCacheTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokens: 10,
  outputTokenDetails: { textTokens: 10, reasoningTokens: 0 },
  totalTokens: 110,
};
const noRerank: RerankFn = async () => {
  throw new Error("not used");
};

const deps = (sink: RetrievalDeps["sink"], rerank: RerankFn = noRerank): RetrievalDeps => ({ embed, match, keyword, rerank, sink });

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
const configs = makeConfigs("gpt-6-luna");

describe("runRetrieval", () => {
  it("scores answerable questions, skips unanswerable ones and returns a valid run file", async () => {
    const { records, sink } = memorySink();
    const run = await runRetrieval(set, configs.vector, deps(sink), { maxUsd: 1, gitSha: "abc123", now, date: new Date("2026-11-06T12:00:00Z") });

    expect(RetrievalRun.parse(run)).toEqual(run);
    expect(run).toMatchObject({ questionCount: 2, skippedUnanswerable: 1, rerankSkipped: 0, gitSha: "abc123", config: { name: "vector", k: 20 } });
    expect(run.models).toEqual({ embedding: "text-embedding-3-small", rerank: null });
    expect(run.perQuestion.map((r) => [r.id, r.firstRelevantRank, r.expected[0], r.rerankStatus])).toEqual([
      ["r01", 1, "ai/p#a", "off"],
      ["r02", 4, "ai/p#c", "off"],
    ]);
    expect(run.metrics.mrr).toBeCloseTo((1 + 1 / 4) / 2, 10);
    expect(run.perQuestion[1].stage.retrieval).toEqual({ retrievedLabelledAt5: true, retrievedLabelledAt8: true, retrievedLabelledAt20: true });
    expect(records).toHaveLength(2);
    expect(run.costUsd).toBeCloseTo(0.04, 8);
    expect(run.costPerQueryUsd).toBeCloseTo(0.02, 8);
  });

  it("hybrid-rerank reranks every question and counts the fallbacks", async () => {
    const { records, sink } = memorySink();
    // Move whichever candidate is c-last to the top: works for any shuffle.
    let calls = 0;
    const rerank: RerankFn = async (args) => {
      calls++;
      const ids = [...args.prompt.matchAll(/^\[(c\d+)\]/gm)].map((m) => m[1]);
      return calls === 1 ? { output: { ids: [ids.at(-1)!] }, usage, finishReason: "stop" } : { output: { ids: ["c99"] }, usage, finishReason: "stop" };
    };
    const run = await runRetrieval(set, configs["hybrid-rerank"], deps(sink, rerank), { maxUsd: 1, gitSha: "x", now });
    expect(run.perQuestion.map((r) => r.rerankStatus)).toEqual(["applied", "skipped"]);
    expect(run.rerankSkipped).toBe(1);
    expect(run.models.rerank).toBe("gpt-6-luna");
    expect(records.map((r) => [r.purpose, r.outcome])).toEqual([
      ["embed_query", "ok"],
      ["rerank", "ok"],
      ["embed_query", "ok"],
      ["rerank", "invalid_output"],
    ]);
  });

  it("stops at the spend cap before returning a run", async () => {
    const { sink } = memorySink();
    await expect(runRetrieval(set, configs.vector, deps(sink), { maxUsd: 0.03, gitSha: "x", now })).rejects.toBeInstanceOf(SpendCapError);
  });
});

describe("config estimates", () => {
  it("price only the answerable questions, and rerank's worst case sits under its default cap at 40 questions", () => {
    expect(configs.vector.estimateUsd(set)).toBeGreaterThan(0);
    expect(configs.vector.estimateUsd(set)).toBeLessThan(0.000001);
    expect(configs.hybrid.estimateUsd(set)).toBe(configs.vector.estimateUsd(set));
    const perRerank = (configs["hybrid-rerank"].estimateUsd(set) - configs.vector.estimateUsd(set)) / 2;
    expect(perRerank).toBeGreaterThan(0.001);
    expect(40 * perRerank).toBeLessThan(configs["hybrid-rerank"].defaultMaxUsd);
  });
});
