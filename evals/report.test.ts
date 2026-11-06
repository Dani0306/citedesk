import { describe, expect, it } from "vitest";
import { formatUsd } from "@/lib/evidence";
import { buildSummary, END, renderAblation, replaceBlock, START } from "@/evals/report";
import type { RetrievalRun } from "@/evals/schema";

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
