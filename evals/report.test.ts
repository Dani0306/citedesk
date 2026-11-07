import { describe, expect, it } from "vitest";
import { formatUsd } from "@/lib/evidence";
import { buildSummary, END, renderAblation, renderCache, renderDiagnosis, replaceBlock, selectGeneration, START, withGeneration } from "@/evals/report";
import type { CacheRun, RetrievalRun } from "@/evals/schema";

const HASH = "a".repeat(64);
const run = (name: string, createdAt: string, opts: Partial<RetrievalRun> = {}): RetrievalRun => ({
  kind: "retrieval",
  createdAt,
  gitSha: "abc",
  note: null,
  config: { name, k: 20 },
  models: { embedding: "text-embedding-3-small", rerank: null },
  pricesReadOn: "2026-11-05",
  questionsHash: HASH,
  questionCount: 40,
  skippedUnanswerable: 0,
  rerankSkipped: 0,
  costUsd: 0.00001,
  costPerQueryUsd: 0.00000041,
  latencyMs: { p50: 900, p95: 1707 },
  metrics: { recallAt5: 0.725, recallAt8: 0.8, recallAt20: 0.9, mrr: 0.61234, ndcgAt10: 0.65 },
  perQuestion: [],
  ...opts,
});

describe("buildSummary", () => {
  it("keeps the latest full-set run per config, in table order", () => {
    const s = buildSummary(
      [
        { file: "b.json", run: run("hybrid", "2026-11-07T10:00:00.000Z") },
        { file: "old.json", run: run("vector", "2026-11-06T10:00:00.000Z") },
        { file: "new.json", run: run("vector", "2026-11-07T10:00:00.000Z") },
      ],
      HASH,
      40,
    );
    expect(s.rows.map((r) => [r.config, r.runFile, r.runDate])).toEqual([
      ["vector", "new.json", "2026-11-07"],
      ["hybrid", "b.json", "2026-11-07"],
    ]);
  });

  it("drops runs on another question set or a smaller one", () => {
    const s = buildSummary(
      [
        { file: "other.json", run: run("vector", "2026-11-07T10:00:00.000Z", { questionsHash: "b".repeat(64) }) },
        { file: "small.json", run: run("hybrid", "2026-11-07T10:00:00.000Z", { questionCount: 3 }) },
      ],
      HASH,
      40,
    );
    expect(s.rows).toEqual([]);
  });

  it("reports nothing while the set itself is below the minimum", () => {
    expect(buildSummary([{ file: "x.json", run: run("vector", "2026-11-07T10:00:00.000Z") }], HASH, 3).rows).toEqual([]);
  });
});

describe("renderAblation", () => {
  it("says how far the set is from the minimum when pending", () => {
    const block = renderAblation(buildSummary([], HASH, 3));
    expect(block).toContain("**Pending:** the question set has 3 of 40 labelled questions.");
    expect(block.startsWith(START) && block.endsWith(END)).toBe(true);
  });

  it("renders points, cost and latency from the run file", () => {
    const block = renderAblation(buildSummary([{ file: "v.json", run: run("vector", "2026-11-07T10:00:00.000Z") }], HASH, 40));
    expect(block).toContain("| Naive vector | 72.5 | 90.0 | 61.2 | 65.0 | $0.00000041 | 1,707 ms | [v.json](evals/runs/v.json) |");
    expect(block).toContain("set `aaaaaaaaaaaa`");
  });
});

describe("replaceBlock and formatUsd", () => {
  it("swaps only the marked block", () => {
    const readme = `# T\n\n${START}\nold\n${END}\n\nrest`;
    expect(replaceBlock(readme, `${START}\nnew\n${END}`)).toBe(`# T\n\n${START}\nnew\n${END}\n\nrest`);
    expect(() => replaceBlock("# no markers", "x")).toThrow(/markers/);
  });

  it("keeps two significant digits without exponents", () => {
    expect(formatUsd(0.00000041)).toBe("$0.00000041");
    expect(formatUsd(0.00154121)).toBe("$0.0015");
    expect(formatUsd(0.12)).toBe("$0.12");
    expect(formatUsd(0)).toBe("$0");
  });
});

describe("generation and judge evidence", () => {
  const gen = (file: string, answerableCount: number, unanswerableCount: number, createdAt = "2026-11-08T10:00:00.000Z") => ({
    file,
    run: {
      kind: "generation" as const,
      createdAt,
      gitSha: "abc",
      note: null,
      config: { name: "hybrid" },
      models: { embedding: "text-embedding-3-small", answer: "gpt-6-luna", rerank: null },
      pricesReadOn: "2026-11-05",
      questionsHash: HASH,
      answerableCount,
      unanswerableCount,
      costUsd: 0.02,
      metrics: {
        hallucinatedCitations: 0,
        citationPrecision: 0.82,
        correctRefusalRate: 0.9,
        falseRefusalRate: 0.05,
        answered: 39,
        costPerQuestionUsd: 0.0004,
        tokensPerAnswer: 3000,
        latencyMs: { p50: 2000, p95: 4000 },
      },
      perQuestion: [],
    },
  });
  const judge = (generationRun: string, outputsJudged: number) => ({
    file: "j.json",
    run: {
      kind: "judge" as const,
      createdAt: "2026-11-08T11:00:00.000Z",
      gitSha: "abc",
      note: null,
      model: "gpt-6.1-sol",
      generationRun,
      rubricHash: "b".repeat(64),
      pricesReadOn: "2026-11-05",
      costUsd: 0.27,
      outputsJudged,
      invalidOutputs: 0,
      staleLabels: 0,
      agreement: { sentences: 120, agreement: 0.875, kappa: 0.71, matrix: { supported: { supported: 0, unsupported: 0, no_claim: 0 }, unsupported: { supported: 0, unsupported: 0, no_claim: 0 }, no_claim: { supported: 0, unsupported: 0, no_claim: 0 } } },
      sentences: [],
    },
  });

  it("uses only a full-set generation run and a judge run of 30 outputs on that same run", () => {
    expect(selectGeneration([gen("small.json", 3, 2)], [], HASH).gen).toBeNull();
    const picked = selectGeneration([gen("g.json", 40, 10)], [judge("g.json", 30), { ...judge("other.json", 30), file: "x.json" }], HASH);
    expect(picked.gen?.file).toBe("g.json");
    expect(picked.judge?.file).toBe("j.json");
    expect(selectGeneration([gen("g.json", 40, 10)], [judge("g.json", 12)], HASH).judge).toBeNull();
  });

  it("fills the summary and the diagnosis block from the picked runs", () => {
    const picked = selectGeneration([gen("g.json", 40, 10)], [judge("g.json", 30)], HASH);
    const s = withGeneration(buildSummary([], HASH, 40), picked);
    expect(s.generation).toMatchObject({ hallucinatedCitations: 0, correctRefusalRate: 0.9, runFile: "g.json" });
    expect(s.judge).toMatchObject({ model: "gpt-6.1-sol", agreement: 0.875, kappa: 0.71 });
    const block = renderDiagnosis(picked, 40, 10);
    expect(block).toContain("Hallucinated citations (a marker pointing at no retrieved source, checked in code): **0** (target 0)");
    expect(block).toContain("88% agreement with 120 hand-labelled sentences, Cohen's κ 0.71.");
    expect(block).toContain("| Retrieved the labelled section | 0 · OK | 0 · Generation problem |");
    expect(block).toContain("| | supported | unsupported | no_claim |");
    expect(block).toContain("| **supported** | 0 | 0 | 0 |");
    expect(block).toContain("0 judge output(s) failed validation and were excluded.");
  });

  it("says what is missing while pending", () => {
    expect(renderDiagnosis({ gen: null, judge: null }, 3, 0)).toContain("needs a generation run on 40 answerable and 10 unanswerable questions (the set has 3 and 0)");
    expect(renderDiagnosis(selectGeneration([gen("g.json", 40, 10)], [], HASH), 40, 10)).toContain("**Groundedness pending:**");
  });
});

describe("renderCache", () => {
  const run = (name: string, createdAt: string, U: number, R: number, O: number, breakEvenRepeatShare: number | null, questions = 4) =>
    ({
      file: `${name}.json`,
      run: { kind: "cache", createdAt, config: { name }, questions: Array.from({ length: questions }, (_, i) => `q${i}`), U, R, O, breakEvenRepeatShare } as unknown as CacheRun,
    });

  it("renders U, R, O and the break-even per config from the latest run, and says how small n is", () => {
    const block = renderCache([
      run("hybrid-rerank", "2026-11-06T10:00:00.000Z", 0.00173, 0.000746, 0.001426, 0.3131),
      run("vector", "2026-11-06T09:00:00.000Z", 0.000999, 0.5, 0.5, 0.9),
      run("vector", "2026-11-06T11:00:00.000Z", 0.000302, 0.00012, 0.000245, 0.3132),
    ]);
    expect(block).toContain("**n = 4 questions per pass, so this measures the mechanism; it is not a benchmark.**");
    expect(block).toContain("| Naive vector | $0.00030 | $0.00012 | $0.00024 | 31% repeats | [vector.json](evals/runs/vector.json) |");
    expect(block.indexOf("Naive vector")).toBeLessThan(block.indexOf("Hybrid + rerank"));
    expect(block).not.toContain("$0.0010");
  });

  it("says never when repeats are not cheaper, and is pending without a run", () => {
    expect(renderCache([run("vector", "2026-11-06T11:00:00.000Z", 1, 1, 1, null)])).toContain("| never |");
    expect(renderCache([])).toContain("**Pending:** no `npm run eval:cache` run yet.");
  });
});
