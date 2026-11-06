import type { LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { memorySink } from "@/lib/calls/sinks";
import { matchLabels, outputsToLabel, pendingLabels, textHash } from "@/evals/groundedness-labels";
import { buildJudgePrompt, runJudge, validateJudge, type JudgeFn } from "@/evals/judge";
import type { GenerationQuestion, GenerationRun, GroundednessLabelFile } from "@/evals/schema";

const usage: LanguageModelUsage = {
  inputTokens: 3000,
  inputTokenDetails: { noCacheTokens: 3000, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokens: 300,
  outputTokenDetails: { textTokens: 200, reasoningTokens: 100 },
  totalTokens: 3300,
};

const question = (id: string, sentences: string[], answered = true): GenerationQuestion => ({
  id,
  question: `Question ${id}?`,
  answerable: true,
  tags: [],
  expected: ["ai/p#a"],
  outcome: answered ? "answered" : "false_refusal",
  refusalReason: answered ? null : "low_score",
  topVectorSimilarity: 0.7,
  answer: answered ? sentences.join(" ") : null,
  sentences: answered ? sentences.map((text, index) => ({ index, text, markers: text.includes("[") ? [1, 2] : [] })) : [],
  sources: [
    { n: 1, chunkKey: "ai/p#a", headingPath: ["P", "A"], content: "Alpha passage." },
    { n: 2, chunkKey: "ai/p#b", headingPath: ["P", "B"], content: "Beta passage." },
    { n: 3, chunkKey: "ai/p#c", headingPath: ["P", "C"], content: "Gamma passage." },
  ],
  citedChunkKeys: ["ai/p#a", "ai/p#b"],
  invalidMarkers: [],
  citationPrecision: 0.5,
  retrievedLabelled: true,
  citedLabelled: true,
  rerankStatus: "off",
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  latencyMs: 0,
});

const gen: { file: string; run: GenerationRun } = {
  file: "2026-11-06-generation-vector.json",
  run: {
    kind: "generation",
    createdAt: "2026-11-06T12:00:00.000Z",
    gitSha: "abc",
    note: null,
    config: { name: "vector" },
    models: { embedding: "text-embedding-3-small", answer: "gpt-6-luna", rerank: null },
    pricesReadOn: "2026-11-05",
    questionsHash: "a".repeat(64),
    answerableCount: 3,
    unanswerableCount: 0,
    costUsd: 0,
    metrics: {
      hallucinatedCitations: 0,
      citationPrecision: 0.5,
      correctRefusalRate: null,
      falseRefusalRate: 0,
      answered: 2,
      costPerQuestionUsd: 0,
      tokensPerAnswer: 0,
      latencyMs: { p50: 0, p95: 0 },
    },
    perQuestion: [question("r01", ["Uses alpha [1][2].", "Here is how it goes:"]), question("r02", [], false), question("r03", ["Beta does it all [1][2]."])],
  },
};

const labels = (entries: [string, number, string, GroundednessLabelFile["labels"][number]["label"]][]): GroundednessLabelFile => ({
  version: 1,
  generationRun: gen.file,
  labels: entries.map(([questionId, index, text, label]) => ({ questionId, index, textHash: textHash(text), label })),
});

describe("labelling queue", () => {
  it("labels only answered outputs, each sentence with just the passages it cites, and skips done ones", () => {
    expect(outputsToLabel(gen.run).map((q) => q.id)).toEqual(["r01", "r03"]);
    const pending = pendingLabels(gen.run, labels([["r01", 0, "Uses alpha [1][2].", "supported"]]));
    expect(pending.map((p) => [p.question.id, p.sentence.index, p.evidence.map((e) => e.n)])).toEqual([
      ["r01", 1, []],
      ["r03", 0, [1, 2]],
    ]);
  });

  it("treats a label whose sentence changed as stale", () => {
    const file = labels([
      ["r01", 0, "Uses alpha [1][2].", "supported"],
      ["r01", 1, "A sentence that is no longer there.", "no_claim"],
    ]);
    expect(matchLabels(gen.run, file)).toMatchObject({ stale: 1 });
  });
});

describe("judge prompt and validation", () => {
  it("shows each sentence with only its cited passages, and none for an uncited one", () => {
    const p = buildJudgePrompt(gen.run.perQuestion[0]);
    expect(p.startsWith("Question: Question r01?")).toBe(true);
    expect(p).toContain("Sentence 0: Uses alpha [1][2].");
    expect(p).toContain("Alpha passage.");
    expect(p).not.toContain("Gamma passage.");
    expect(p).toContain("Sentence 1: Here is how it goes:\nCited passages:\n(none: this sentence cites nothing)");
  });

  it("accepts exactly one known label per index and rejects anything else", () => {
    expect("labels" in validateJudge({ labels: [{ index: 0, label: "supported", reason: "r" }, { index: 1, label: "no_claim", reason: "r" }] }, [0, 1])).toBe(true);
    expect(validateJudge({ labels: [{ index: 0, label: "supported", reason: "r" }] }, [0, 1])).toEqual({ error: "no label for sentence 1" });
    expect(validateJudge({ labels: [{ index: 0, label: "supported", reason: "" }, { index: 0, label: "supported", reason: "" }] }, [0])).toEqual({
      error: "sentence 0 labelled twice",
    });
    expect(validateJudge({ labels: [{ index: 7, label: "supported", reason: "" }] }, [0])).toEqual({ error: "unknown sentence index 7" });
    expect(validateJudge({ labels: [{ index: 0, label: "maybe", reason: "" }] }, [0])).toEqual({ error: "output does not match the schema" });
  });
});

describe("runJudge", () => {
  const file = labels([
    ["r01", 0, "Uses alpha [1][2].", "supported"],
    ["r01", 1, "Here is how it goes:", "no_claim"],
    ["r03", 0, "Beta does it all [1][2].", "unsupported"],
  ]);

  it("judges the labelled outputs and scores agreement against the humans", async () => {
    const judge: JudgeFn = async (args) => {
      const all = args.prompt.includes("Sentence 1")
        ? [{ index: 0, label: "supported", reason: "a" }, { index: 1, label: "no_claim", reason: "b" }]
        : [{ index: 0, label: "supported", reason: "c" }];
      return { output: { labels: all }, usage, finishReason: "stop" };
    };
    const { records, sink } = memorySink();
    const run = await runJudge(gen, file, "# rubric", "gpt-6.1-sol", { judge, sink }, { maxUsd: 1, gitSha: "x" });
    expect(run).toMatchObject({ outputsJudged: 2, invalidOutputs: 0, staleLabels: 0 });
    expect(run.agreement.sentences).toBe(3);
    expect(run.agreement.agreement).toBeCloseTo(2 / 3, 12);
    expect(run.agreement.matrix.unsupported.supported).toBe(1);
    expect(records.map((r) => [r.purpose, r.model, r.outcome])).toEqual([
      ["judge", "gpt-6.1-sol", "ok"],
      ["judge", "gpt-6.1-sol", "ok"],
    ]);
  });

  it("excludes an invalid judge output from agreement and counts it", async () => {
    const judge: JudgeFn = async () => ({ output: { labels: [{ index: 0, label: "supported", reason: "" }] }, usage, finishReason: "stop" });
    const { records, sink } = memorySink();
    const run = await runJudge(gen, file, "# rubric", "gpt-6.1-sol", { judge, sink }, { maxUsd: 1, gitSha: "x" });
    // r01 has two sentences but the judge labelled one: invalid. r03 is fine (supported vs human unsupported).
    expect(run.invalidOutputs).toBe(1);
    expect(run.agreement.sentences).toBe(1);
    expect(run.sentences.filter((s) => s.judge === null)).toHaveLength(2);
    expect(records.map((r) => r.outcome)).toEqual(["invalid_output", "ok"]);
  });

  it("refuses to judge a run other than the one labelled", async () => {
    const { sink } = memorySink();
    await expect(runJudge({ ...gen, file: "other.json" }, file, "#", "gpt-6.1-sol", { judge: async () => ({ output: null, usage, finishReason: "stop" }), sink }, { maxUsd: 1, gitSha: "x" })).rejects.toThrow(
      /judge the run that was labelled/,
    );
  });
});
