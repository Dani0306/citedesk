import { describe, expect, it } from "vitest";
import { buildBaseline, gateGeneration, gateRetrieval, gateSmoke, smokeSubset, type Baseline } from "@/evals/gate";
import { QuestionSet, type GenerationRun, type Metrics, type RetrievalRun } from "@/evals/schema";

const HASH = "a".repeat(64);
const m = (recallAt5: number, mrr: number): Metrics => ({ recallAt5, recallAt8: recallAt5, recallAt20: recallAt5, mrr, ndcgAt10: mrr });

const retrieval = (metrics: Metrics, perQuestion: Record<string, Metrics> = {}, opts: Partial<RetrievalRun> = {}): RetrievalRun => ({
  kind: "retrieval",
  createdAt: "2026-11-08T10:00:00.000Z",
  gitSha: "abc",
  note: null,
  config: { name: "vector", k: 20 },
  models: { embedding: "text-embedding-3-small", rerank: null },
  pricesReadOn: "2026-11-05",
  questionsHash: HASH,
  questionCount: 40,
  skippedUnanswerable: 10,
  rerankSkipped: 0,
  costUsd: 0,
  costPerQueryUsd: 0,
  latencyMs: { p50: 0, p95: 0 },
  metrics,
  perQuestion: Object.entries(perQuestion).map(([id, metrics]) => ({
    id,
    question: id,
    tags: [],
    expected: [],
    retrieved: [],
    firstRelevantRank: null,
    rerankStatus: "off" as const,
    metrics,
    stage: { retrieval: { retrievedLabelledAt5: false, retrievedLabelledAt8: false, retrievedLabelledAt20: false } },
    latencyMs: 0,
    costUsd: 0,
  })),
  ...opts,
});

const baseline: Baseline = {
  version: 1,
  createdAt: "2026-11-08T10:00:00.000Z",
  gitSha: "abc",
  questionsHash: HASH,
  retrieval: { vector: { runFile: "v.json", metrics: m(0.7, 0.6), perQuestion: { r01: m(1, 1), r02: m(0, 0) } } },
  generation: { runFile: "g.json", config: "vector", hallucinatedCitations: 0, correctRefusalRate: 0.9, falseRefusalRate: 0.1 },
};

describe("gateRetrieval", () => {
  it("passes a 2.0-point drop and fails a 2.1-point drop", () => {
    expect(gateRetrieval(retrieval(m(0.68, 0.6)), baseline).pass).toBe(true);
    const failed = gateRetrieval(retrieval(m(0.679, 0.6)), baseline);
    expect(failed.pass).toBe(false);
    expect(failed.checks.find((c) => !c.pass)?.metric).toBe("recallAt5");
  });

  it("fails a run on a different question set, and a config with no baseline", () => {
    expect(gateRetrieval(retrieval(m(0.9, 0.9), {}, { questionsHash: "b".repeat(64) }), baseline).pass).toBe(false);
    expect(gateRetrieval(retrieval(m(0.9, 0.9), {}, { config: { name: "hybrid", k: 20 } }), baseline).checks.at(-1)?.note).toMatch(/no baseline for config hybrid/);
  });
});

describe("gateSmoke", () => {
  it("compares the subset with the baseline's own scores for the same questions", () => {
    // Baseline for r01 + r02 averages to recall@5 0.5, MRR 0.5.
    expect(gateSmoke(retrieval(m(0.49, 0.5), { r01: m(1, 1), r02: m(0, 0) }), baseline, HASH).pass).toBe(true);
    expect(gateSmoke(retrieval(m(0.47, 0.5), { r01: m(1, 1), r02: m(0, 0) }), baseline, HASH).pass).toBe(false);
    expect(gateSmoke(retrieval(m(1, 1), { r09: m(1, 1) }), baseline, HASH).checks.at(-1)?.note).toMatch(/r09/);
  });
});

describe("gateGeneration", () => {
  const gen = (metrics: Partial<GenerationRun["metrics"]>) =>
    ({
      questionsHash: HASH,
      metrics: { hallucinatedCitations: 0, citationPrecision: 0.8, correctRefusalRate: 0.9, falseRefusalRate: 0.1, answered: 39, costPerQuestionUsd: 0, tokensPerAnswer: 0, latencyMs: { p50: 0, p95: 0 }, ...metrics },
    }) as GenerationRun;

  it("fails on any hallucinated citation, whatever the baseline", () => {
    expect(gateGeneration(gen({}), baseline).pass).toBe(true);
    expect(gateGeneration(gen({ hallucinatedCitations: 1 }), baseline).pass).toBe(false);
  });

  it("holds refusal rates to within 2 points in the right direction", () => {
    expect(gateGeneration(gen({ correctRefusalRate: 0.88, falseRefusalRate: 0.12 }), baseline).pass).toBe(true);
    expect(gateGeneration(gen({ correctRefusalRate: 0.87 }), baseline).pass).toBe(false);
    expect(gateGeneration(gen({ falseRefusalRate: 0.13 }), baseline).pass).toBe(false);
  });
});

describe("buildBaseline and smokeSubset", () => {
  it("takes only full-set runs and keeps per-question scores", () => {
    const b = buildBaseline([{ file: "v.json", run: retrieval(m(0.7, 0.6), { r01: m(1, 1) }) }], null, HASH, "abc");
    expect(b.retrieval.vector.perQuestion.r01.mrr).toBe(1);
    expect(() => buildBaseline([{ file: "s.json", run: retrieval(m(1, 1), {}, { questionCount: 3 }) }], null, HASH, "abc")).toThrow(/needs 40/);
    expect(() => buildBaseline([{ file: "o.json", run: retrieval(m(1, 1), {}, { questionsHash: "b".repeat(64) }) }], null, HASH, "abc")).toThrow(/different question set/);
  });

  it("prefers questions tagged smoke, else the first 10 answerable", () => {
    const q = (id: string, tags: string[] = [], answerable = true) => ({ id, question: id, answerable, expected: answerable ? ["k"] : [], tags });
    const set = QuestionSet.parse({ version: 1, questions: [q("u1", [], false), ...Array.from({ length: 12 }, (_, i) => q(`r${i}`))] });
    expect(smokeSubset(set).questions.map((x) => x.id)).toEqual(Array.from({ length: 10 }, (_, i) => `r${i}`));
    const tagged = QuestionSet.parse({ version: 1, questions: [q("r1"), q("r2", ["smoke"])] });
    expect(smokeSubset(tagged).questions.map((x) => x.id)).toEqual(["r2"]);
  });
});
