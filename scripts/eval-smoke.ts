// npm run eval:smoke — the cheap check for every push (T40): retrieval only, vector config, on the
// smoke subset (questions tagged "smoke", else the first 10 answerable). One embedding per question,
// about $0.000003. Writes evals/runs/ci-smoke.json (gitignored) and gates it against the baseline's
// scores for the same questions; without a baseline it reports and exits 0.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { db } from "../lib/db/client";
import { openaiEmbed } from "../lib/ingest/embed";
import { supabaseKeyword } from "../lib/retrieve/keyword";
import { openaiRerank } from "../lib/retrieve/rerank";
import { supabaseMatch } from "../lib/retrieve/vector";
import { makeConfigs } from "../evals/configs";
import { Baseline, gateSmoke, smokeSubset } from "../evals/gate";
import { runRetrieval } from "../evals/retrieval";
import { questionsHash } from "../evals/schema";
import { checkedQuestions, gitSha, main, maxUsdArg, RUNS_DIR, scriptSink } from "./eval-shared";

const BASELINE = path.join(process.cwd(), "evals", "baseline.json");

main(async () => {
  const set = await checkedQuestions();
  const subset = smokeSubset(set);
  const run = await runRetrieval(
    subset,
    makeConfigs().vector,
    { embed: openaiEmbed, match: supabaseMatch(db()), keyword: supabaseKeyword(db()), rerank: openaiRerank, sink: scriptSink() },
    { maxUsd: maxUsdArg(0.01), gitSha: gitSha(), note: "smoke" },
  );
  mkdirSync(RUNS_DIR, { recursive: true });
  writeFileSync(path.join(RUNS_DIR, "ci-smoke.json"), `${JSON.stringify(run, null, 2)}\n`);
  console.log(`Smoke: ${run.questionCount} questions, recall@5 ${(run.metrics.recallAt5 * 100).toFixed(1)}, MRR ${(run.metrics.mrr * 100).toFixed(1)}, $${run.costUsd.toFixed(8)}`);

  if (!existsSync(BASELINE)) {
    console.log("No evals/baseline.json yet: smoke ran, nothing to gate against.");
    return;
  }
  const v = gateSmoke(run, Baseline.parse(JSON.parse(readFileSync(BASELINE, "utf8"))), questionsHash(set));
  console.log(`${v.pass ? "PASS" : "FAIL"} smoke`);
  for (const c of v.checks) console.log(`  ${c.pass ? "ok  " : "FAIL"} ${c.metric}${c.baseline !== null && c.run !== null ? `  baseline ${(c.baseline * 100).toFixed(1)} → run ${(c.run * 100).toFixed(1)}` : ""}${c.note ? `  (${c.note})` : ""}`);
  if (!v.pass) process.exit(1);
});
