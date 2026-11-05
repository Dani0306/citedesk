import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEvidence } from "@/app/_landing/evidence-data";

describe("loadEvidence", () => {
  const dirs: string[] = [];
  const tmp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "citedesk-runs-"));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it("is pending when the runs directory doesn't exist", () => {
    expect(loadEvidence(path.join(os.tmpdir(), "citedesk-does-not-exist"))).toEqual({ status: "pending" });
  });

  it("is pending when only CI scratch files or non-JSON files exist", () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, "ci-eval.json"), "{}");
    fs.writeFileSync(path.join(d, "notes.txt"), "");
    expect(loadEvidence(d)).toEqual({ status: "pending" });
  });

  it("refuses to render once a real run file exists but isn't wired", () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, "2026-11-12-retrieval.json"), "{}");
    expect(() => loadEvidence(d)).toThrow(/T27/);
  });
});
