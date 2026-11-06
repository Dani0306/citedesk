import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEvidence } from "@/app/_landing/evidence-data";

const summary = (rows: unknown[], questionCount = 40) =>
  JSON.stringify({ questionsHash: "a".repeat(64), questionCount, minQuestions: 40, rows });

const row = {
  config: "vector",
  recallAt5: 0.7,
  recallAt20: 0.9,
  mrr: 0.6,
  ndcgAt10: 0.65,
  costPerQueryUsd: 0.0000004,
  p95LatencyMs: 1700,
  runFile: "2026-11-12-retrieval-vector.json",
  runDate: "2026-11-12",
};

describe("loadEvidence", () => {
  const dirs: string[] = [];
  const tmp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "citedesk-evals-"));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it("is pending when there is neither a summary nor a run", () => {
    expect(loadEvidence(path.join(os.tmpdir(), "citedesk-does-not-exist"))).toMatchObject({ status: "pending" });
  });

  it("ignores CI scratch files when there is no summary", () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, "runs"));
    fs.writeFileSync(path.join(d, "runs", "ci-eval.json"), "{}");
    expect(loadEvidence(d)).toMatchObject({ status: "pending" });
  });

  it("refuses to build when run files exist but were never summarised", () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, "runs"));
    fs.writeFileSync(path.join(d, "runs", "2026-11-12-retrieval-vector.json"), "{}");
    expect(() => loadEvidence(d)).toThrow(/eval:report/);
  });

  it("stays pending, with the set's progress, while the summary has no rows", () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, "evidence.json"), summary([], 3));
    expect(loadEvidence(d)).toEqual({ status: "pending", questionCount: 3, minQuestions: 40 });
  });

  it("returns the measured rows from the summary", () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, "evidence.json"), summary([row]));
    const e = loadEvidence(d);
    expect(e.status).toBe("measured");
    if (e.status === "measured") expect(e.summary.rows[0].config).toBe("vector");
  });

  it("rejects a malformed summary", () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, "evidence.json"), JSON.stringify({ rows: "nope" }));
    expect(() => loadEvidence(d)).toThrow();
  });
});
