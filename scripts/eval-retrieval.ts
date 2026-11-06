// npm run eval:retrieval -- --config=vector|hybrid|hybrid-rerank [--max-usd=…] [--note="..."]
// Scores one retrieval config over evals/questions.json and writes evals/runs/YYYY-MM-DD-retrieval-<config>.json
// plus a copy in citedesk.eval_runs. vector and hybrid: one query embedding per question (~$0.0000003);
// hybrid-rerank adds one gpt-6-luna call per question (~$0.0015, worst case ~$0.0026). Each config has a default cap.
import path from "node:path";
import { writeFileSync } from "node:fs";
import { combineSinks, dbSink, jsonlSink } from "../lib/calls/sinks";
import { db } from "../lib/db/client";
import { openaiEmbed } from "../lib/ingest/embed";
import { supabaseKeyword } from "../lib/retrieve/keyword";
import { openaiRerank } from "../lib/retrieve/rerank";
import { supabaseMatch } from "../lib/retrieve/vector";
import { makeConfigs } from "../evals/configs";
import { runRetrieval } from "../evals/retrieval";
import type { RetrievalRun } from "../evals/schema";
import { arg, checkedQuestions, gitSha, insertEvalRun, main, maxUsdArg, runFile } from "./eval-shared";

const pts = (x: number) => (x * 100).toFixed(1).padStart(5);

function printSummary(run: RetrievalRun, file: string, evalRunId: number) {
  const m = run.metrics;
  console.log(`\n${run.config.name} · ${run.questionCount} questions (${run.skippedUnanswerable} unanswerable skipped) · hash ${run.questionsHash.slice(0, 12)}`);
  console.log("recall@5  recall@8  recall@20    MRR  nDCG@10   (points)");
  console.log(`   ${pts(m.recallAt5)}     ${pts(m.recallAt8)}      ${pts(m.recallAt20)}  ${pts(m.mrr)}    ${pts(m.ndcgAt10)}`);
  console.log(`cost $${run.costUsd.toFixed(8)} ($${run.costPerQueryUsd.toFixed(8)}/query) · latency p50 ${run.latencyMs.p50} ms, p95 ${run.latencyMs.p95} ms`);
  if (run.models.rerank) console.log(`rerank skipped (fell back to fused order) on ${run.rerankSkipped} of ${run.questionCount}`);
  const misses = run.perQuestion.filter((r) => r.firstRelevantRank === null);
  if (misses.length) {
    console.log(`\nMissed at 20 (${misses.length}):`);
    for (const r of misses) console.log(`  ${r.id}  ${r.question}\n        expected ${r.expected.join(", ")}\n        got #1 ${r.retrieved[0]?.chunkKey ?? "—"}`);
  }
  console.log(`\nWrote ${path.relative(process.cwd(), file)} · eval_runs ${evalRunId}`);
}

main(async () => {
  const name = arg("config") ?? "vector";
  const configs = makeConfigs();
  const config = configs[name];
  if (!config) throw new Error(`Unknown --config=${name}. Known: ${Object.keys(configs).join(", ")}`);
  const maxUsd = maxUsdArg(config.defaultMaxUsd);
  const set = await checkedQuestions();

  const estimate = config.estimateUsd(set);
  console.log(`Estimate: $${estimate.toFixed(8)} for ${set.questions.filter((q) => q.answerable).length} questions (cap $${maxUsd})`);
  if (estimate > maxUsd) throw new Error("Estimate is above --max-usd; nothing was spent");

  const date = new Date();
  const run = await runRetrieval(
    set,
    config,
    {
      embed: openaiEmbed,
      match: supabaseMatch(db()),
      keyword: supabaseKeyword(db()),
      rerank: openaiRerank,
      sink: combineSinks(jsonlSink(), dbSink(db())),
    },
    { maxUsd, gitSha: gitSha(), note: arg("note") ?? null, date, onQuestion: (done, total) => process.stdout.write(`\r${done}/${total}`) },
  );

  const file = runFile("retrieval", name, date);
  writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
  const id = await insertEvalRun({ kind: "retrieval", config: run.config, models: run.models, prices_read_on: run.pricesReadOn, cost_usd: run.costUsd, results: run });
  printSummary(run, file, id);
});
