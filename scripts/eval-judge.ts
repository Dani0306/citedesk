// npm run eval:judge -- --model=gpt-6.1-sol|gpt-6-luna [--labels=evals/labels/groundedness.json] [--max-usd=0.5]
// Judges the human-labelled outputs of one generation run against evals/rubric.md (T36) and reports
// agreement, Cohen's kappa and the confusion matrix. Writes evals/runs/YYYY-MM-DD-judge-<model>.json
// plus an eval_runs row. About $0.009 an output on sol, $0.0005 on luna.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openaiJudge, runJudge } from "../evals/judge";
import { GenerationRun, GROUNDEDNESS_LABELS, GroundednessLabelFile } from "../evals/schema";
import { arg, gitSha, insertEvalRun, main, maxUsdArg, runFile, RUNS_DIR, scriptSink } from "./eval-shared";

main(async () => {
  const model = arg("model");
  if (!model) throw new Error("Usage: npm run eval:judge -- --model=gpt-6.1-sol (or gpt-6-luna)");
  const maxUsd = maxUsdArg(0.5);
  const labels = GroundednessLabelFile.parse(JSON.parse(readFileSync(path.resolve(arg("labels") ?? "evals/labels/groundedness.json"), "utf8")));
  const genFile = labels.generationRun;
  const gen = GenerationRun.parse(JSON.parse(readFileSync(path.join(RUNS_DIR, genFile), "utf8")));
  const rubric = readFileSync(path.join(process.cwd(), "evals", "rubric.md"), "utf8");

  const date = new Date();
  const run = await runJudge(
    { file: genFile, run: gen },
    labels,
    rubric,
    model,
    { judge: openaiJudge, sink: scriptSink() },
    { maxUsd, gitSha: gitSha(), note: arg("note") ?? null, date, onAnswer: (d, t) => process.stdout.write(`\r${d}/${t}`) },
  );
  const file = runFile("judge", model, date);
  writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
  const id = await insertEvalRun({
    kind: "judge",
    config: { generationRun: genFile, rubricHash: run.rubricHash },
    models: { judge: model },
    prices_read_on: run.pricesReadOn,
    cost_usd: run.costUsd,
    results: run,
  });

  const a = run.agreement;
  console.log(`\n\n${model} on ${run.outputsJudged} outputs of ${genFile} (rubric ${run.rubricHash.slice(0, 12)})`);
  console.log(`agreement ${a.agreement === null ? "n/a" : `${(a.agreement * 100).toFixed(1)}%`} on ${a.sentences} sentences · Cohen's κ ${a.kappa?.toFixed(3) ?? "n/a"} · target ≥ 85%`);
  console.log(`invalid outputs ${run.invalidOutputs} · stale labels ${run.staleLabels} · cost $${run.costUsd.toFixed(6)}`);
  console.log(`\nhuman ↓ / judge →   ${GROUNDEDNESS_LABELS.map((l) => l.padStart(12)).join("")}`);
  for (const h of GROUNDEDNESS_LABELS) console.log(`${h.padEnd(19)} ${GROUNDEDNESS_LABELS.map((j) => String(a.matrix[h][j]).padStart(12)).join("")}`);
  const disagreements = run.sentences.filter((s) => s.judge !== null && s.judge !== s.human);
  if (disagreements.length) {
    console.log(`\nDisagreements (edit the rubric, never the labels):`);
    for (const s of disagreements) console.log(`  ${s.questionId}#${s.index}  human ${s.human}, judge ${s.judge}: ${s.reason}`);
  }
  console.log(`\nWrote ${path.relative(process.cwd(), file)} · eval_runs ${id ?? "not written"}`);
});
