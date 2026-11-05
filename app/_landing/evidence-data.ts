import fs from "node:fs";
import path from "node:path";

// The Evidence section only ever shows numbers from eval run files. Until runs exist it
// renders "pending". Synchronous reads are prerendered into the static shell under
// Cache Components (Next 16 caching docs, "Predictable values").

export type Evidence = { status: "pending" };

export const RUNS_DIR = path.join(process.cwd(), "evals", "runs");

export function loadEvidence(dir: string = RUNS_DIR): Evidence {
  // ci-*.json files are the CI gate's scratch output and are gitignored. The page is fully
  // prerendered, so the deployed server never needs these files: keep Turbopack from tracing them.
  const runs = fs.existsSync(/*turbopackIgnore: true*/ dir)
    ? fs.readdirSync(/*turbopackIgnore: true*/ dir).filter((f) => f.endsWith(".json") && !f.startsWith("ci-"))
    : [];
  if (runs.length === 0) return { status: "pending" };

  // Fail the build rather than show "pending" over real results, or a format guessed
  // before T21 defines it.
  throw new Error(
    `Found ${runs.length} eval run file(s) in ${dir}, but the landing page's Evidence section ` +
      "isn't wired to the run-file schema yet. Wire loadEvidence() to it (build guide T27) before building.",
  );
}
