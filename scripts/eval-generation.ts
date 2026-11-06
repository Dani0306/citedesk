// npm run eval:generation [-- --config=vector|hybrid|hybrid-rerank] [--max-usd=…] [--note="…"]
// Answers every question through answerQuestion (T34) and records, per question, what each stage
// did. Writes evals/runs/YYYY-MM-DD-generation-<config>.json plus an eval_runs row. About $0.0005
// a question on vector; prints a worst-case estimate first and stops at the cap.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { openaiGenerate } from "../lib/answer/answer";
import { combineSinks, dbSink, jsonlSink } from "../lib/calls/sinks";
import { db } from "../lib/db/client";
import { openaiEmbed } from "../lib/ingest/embed";
import { supabaseKeyword } from "../lib/retrieve/keyword";
import { openaiRerank } from "../lib/retrieve/rerank";
import { supabaseMatch } from "../lib/retrieve/vector";
import { estimateGenerationUsd, GENERATION_CONFIGS, generationConfig, runGeneration } from "../evals/generation";
import { arg, checkedQuestions, gitSha, insertEvalRun, main, maxUsdArg, runFile } from "./eval-shared";

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(0)}%`);

main(async () => {
  const name = arg("config") ?? "vector";
  const config = generationConfig(name);
  const maxUsd = maxUsdArg(GENERATION_CONFIGS[name].defaultMaxUsd);
  const set = await checkedQuestions();

  const estimate = estimateGenerationUsd(set, config);
  console.log(`Estimate (worst case): $${estimate.toFixed(6)} for ${set.questions.length} questions (cap $${maxUsd}) · threshold ${config.threshold} (${config.thresholdSource})`);
  if (estimate > maxUsd) throw new Error("Estimate is above --max-usd; nothing was spent");

  const date = new Date();
  const run = await runGeneration(
    set,
    name,
    config,
    {
      embed: openaiEmbed,
      match: supabaseMatch(db()),
      keyword: supabaseKeyword(db()),
      rerank: openaiRerank,
      generate: openaiGenerate,
      sink: combineSinks(jsonlSink(), dbSink(db())),
    },
    { maxUsd, gitSha: gitSha(), note: arg("note") ?? null, date, onQuestion: (d, t) => process.stdout.write(`\r${d}/${t}`) },
  );
  const file = runFile("generation", name, date);
  writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
  const id = await insertEvalRun({ kind: "generation", config: run.config, models: run.models, prices_read_on: run.pricesReadOn, cost_usd: run.costUsd, results: run });

  const m = run.metrics;
  console.log(`\n\n${name} · ${run.answerableCount} answerable + ${run.unanswerableCount} unanswerable · hash ${run.questionsHash.slice(0, 12)}`);
  console.log(`hallucinated citations ${m.hallucinatedCitations} (target 0) · citation precision ${pct(m.citationPrecision)}`);
  console.log(`correct refusals ${pct(m.correctRefusalRate)} · false refusals ${pct(m.falseRefusalRate)} · answered ${m.answered}`);
  console.log(`cost $${run.costUsd.toFixed(6)} ($${m.costPerQuestionUsd.toFixed(6)}/question) · latency p50 ${m.latencyMs.p50} ms, p95 ${m.latencyMs.p95} ms`);
  for (const q of run.perQuestion.filter((q) => q.outcome !== "answered" && q.outcome !== "correct_refusal")) {
    console.log(`  ${q.outcome.padEnd(22)} ${q.id}  top ${q.topVectorSimilarity?.toFixed(3) ?? "—"}  ${q.question}`);
  }
  for (const q of run.perQuestion.filter((q) => q.invalidMarkers.length)) console.log(`  hallucinated [${q.invalidMarkers.join("][")}] in ${q.id}`);
  console.log(`\nWrote ${path.relative(process.cwd(), file)} · eval_runs ${id}`);
});
