import fs from "node:fs";
import path from "node:path";
import { EvidenceSummary } from "@/lib/evidence";

// The Evidence section only ever shows numbers from evals/evidence.json, which `npm run eval:report`
// renders from the run files (T27) and which only lists runs on the full labelled set. Synchronous
// reads are prerendered into the static shell under Cache Components (Next 16 caching docs,
// "Predictable values").

export type Evidence = { status: "pending"; questionCount: number; minQuestions: number } | { status: "measured"; summary: EvidenceSummary };

export const EVALS_DIR = path.join(process.cwd(), "evals");

export function loadEvidence(dir: string = EVALS_DIR): Evidence {
  const summaryFile = path.join(dir, "evidence.json");
  const runsDir = path.join(dir, "runs");
  // The page is fully prerendered, so the deployed server never reads these: keep Turbopack from tracing them.
  if (!fs.existsSync(/*turbopackIgnore: true*/ summaryFile)) {
    const runs = fs.existsSync(/*turbopackIgnore: true*/ runsDir)
      ? fs.readdirSync(/*turbopackIgnore: true*/ runsDir).filter((f) => f.endsWith(".json") && !f.startsWith("ci-"))
      : [];
    // Fail the build rather than show "pending" over results that exist but were never summarised.
    if (runs.length > 0) {
      throw new Error(`Found ${runs.length} eval run file(s) but no evals/evidence.json. Run npm run eval:report before building.`);
    }
    return { status: "pending", questionCount: 0, minQuestions: 40 };
  }
  const summary = EvidenceSummary.parse(JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ summaryFile, "utf8")));
  return summary.rows.length === 0 && !summary.generation && !summary.judge
    ? { status: "pending", questionCount: summary.questionCount, minQuestions: summary.minQuestions }
    : { status: "measured", summary };
}
