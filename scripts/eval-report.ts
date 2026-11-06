// npm run eval:report            — renders the README ablation table and evals/evidence.json from evals/runs/
// npm run eval:report -- --check — exits 1 if either is out of date (for CI, T41). Free: no model calls.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadQuestions } from "../evals/inputs";
import { buildSummary, renderAblation, renderSummaryJson, replaceBlock } from "../evals/report";
import { questionsHash, RetrievalRun } from "../evals/schema";

const root = process.cwd();
const RUNS = path.join(root, "evals", "runs");
const README = path.join(root, "README.md");
const SUMMARY = path.join(root, "evals", "evidence.json");

function loadRuns(): { file: string; run: RetrievalRun }[] {
  if (!existsSync(RUNS)) return [];
  return readdirSync(RUNS)
    .filter((f) => f.endsWith(".json") && !f.startsWith("ci-"))
    .sort()
    .flatMap((file) => {
      const json = JSON.parse(readFileSync(path.join(RUNS, file), "utf8"));
      if (json.kind !== "retrieval") return []; // generation and judge runs get their own tables later
      const parsed = RetrievalRun.safeParse(json);
      if (!parsed.success) throw new Error(`${file} is not a valid retrieval run: ${parsed.error.message}`);
      return [{ file, run: parsed.data }];
    });
}

function main() {
  const check = process.argv.includes("--check");
  const set = loadQuestions();
  const runs = loadRuns();
  const summary = buildSummary(runs, questionsHash(set), set.questions.filter((q) => q.answerable).length);

  const readme = readFileSync(README, "utf8");
  const nextReadme = replaceBlock(readme, renderAblation(summary));
  const nextSummary = renderSummaryJson(summary);
  const currentSummary = existsSync(SUMMARY) ? readFileSync(SUMMARY, "utf8") : "";

  if (check) {
    const stale = [readme !== nextReadme && "README.md", currentSummary !== nextSummary && "evals/evidence.json"].filter(Boolean);
    if (stale.length) {
      console.error(`Out of date: ${stale.join(", ")}. Run npm run eval:report and commit the result.`);
      process.exit(1);
    }
    console.log("Ablation table and evidence summary are up to date.");
    return;
  }

  writeFileSync(README, nextReadme);
  writeFileSync(SUMMARY, nextSummary);
  console.log(`${runs.length} retrieval run file(s) read; ${summary.rows.length} reported (set ${summary.questionsHash.slice(0, 12)}, ${summary.questionCount} answerable).`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
