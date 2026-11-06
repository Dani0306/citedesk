// npm run eval:baseline -- --retrieval=evals/runs/a.json,evals/runs/b.json [--generation=evals/runs/g.json]
// Writes evals/baseline.json from full-set runs only (T40). Commit it on its own, with the reason in
// the message: the baseline changes only on purpose.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildBaseline } from "../evals/gate";
import { loadQuestions } from "../evals/inputs";
import { GenerationRun, questionsHash, RetrievalRun } from "../evals/schema";
import { arg, gitSha, main } from "./eval-shared";

const BASELINE = path.join(process.cwd(), "evals", "baseline.json");
const read = (file: string) => JSON.parse(readFileSync(path.resolve(file), "utf8"));

main(async () => {
  const retrieval = (arg("retrieval") ?? "").split(",").filter(Boolean);
  if (!retrieval.length) throw new Error("Usage: npm run eval:baseline -- --retrieval=<run files, comma-separated> [--generation=<run file>]");
  const gen = arg("generation");
  const baseline = buildBaseline(
    retrieval.map((f) => ({ file: path.basename(f), run: RetrievalRun.parse(read(f)) })),
    gen ? { file: path.basename(gen), run: GenerationRun.parse(read(gen)) } : null,
    questionsHash(loadQuestions()),
    gitSha(),
  );
  writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`Wrote evals/baseline.json: retrieval ${Object.keys(baseline.retrieval).join(", ")}${baseline.generation ? `, generation ${baseline.generation.config}` : ""}.`);
  console.log("Commit it on its own, with the reason.");
});
