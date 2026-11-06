// npm run eval:threshold [-- --note="…"] — sweeps the refusal threshold (T33) over every question:
// one query embedding each (~$0.0000003), the vector arm's top similarity recorded. Writes
// evals/runs/YYYY-MM-DD-threshold.json; set the chosen value as CITEDESK_REFUSAL_THRESHOLD.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { combineSinks } from "../lib/calls/sinks";
import { PRICING_READ_ON } from "../lib/cost/pricing";
import { db } from "../lib/db/client";
import { openaiEmbed } from "../lib/ingest/embed";
import { EMBEDDING_MODEL } from "../lib/models";
import { supabaseMatch, vectorSearch } from "../lib/retrieve/vector";
import { questionsHash, ThresholdSweep } from "../evals/schema";
import { chooseThreshold, sweepThresholds } from "../evals/threshold";
import { arg, checkedQuestions, gitSha, main, runFile, scriptSink } from "./eval-shared";

const pct = (x: number) => `${(x * 100).toFixed(0).padStart(3)}%`;

main(async () => {
  const set = await checkedQuestions();
  let spent = 0;
  const sink = combineSinks(scriptSink(), async (r) => void (spent += r.costUsd));

  const scores = [];
  for (const q of set.questions) {
    const [top] = await vectorSearch(q.question, 1, { embed: openaiEmbed, match: supabaseMatch(db()), sink });
    scores.push({ id: q.id, answerable: q.answerable, tags: q.tags, topSimilarity: top?.similarity ?? null });
    process.stdout.write(`\r${scores.length}/${set.questions.length}`);
  }
  const sweep = sweepThresholds(scores);
  const chosen = chooseThreshold(sweep);
  const date = new Date();
  const result = ThresholdSweep.parse({
    kind: "threshold",
    createdAt: date.toISOString(),
    gitSha: gitSha(),
    note: arg("note") ?? null,
    models: { embedding: EMBEDDING_MODEL },
    pricesReadOn: PRICING_READ_ON,
    questionsHash: questionsHash(set),
    answerableCount: scores.filter((s) => s.answerable).length,
    unanswerableCount: scores.filter((s) => !s.answerable).length,
    costUsd: Math.round(spent * 1e8) / 1e8,
    scores,
    sweep,
    chosen,
  });
  const file = runFile("threshold", null, date);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);

  console.log("\n\nTop vector similarity per question (lowest first):");
  for (const s of [...scores].sort((a, b) => (a.topSimilarity ?? -1) - (b.topSimilarity ?? -1))) {
    console.log(`  ${s.topSimilarity?.toFixed(3) ?? "  —  "}  ${s.answerable ? "answerable  " : "UNANSWERABLE"}  ${s.id}${s.tags.length ? `  [${s.tags.join(", ")}]` : ""}`);
  }
  console.log("\nthreshold  refuses unanswerable  refuses answerable  balanced accuracy");
  for (const r of sweep.filter((r) => Math.round(r.threshold * 100) % 5 === 0 || r.threshold === chosen.threshold)) {
    console.log(`   ${r.threshold.toFixed(2)}${r.threshold === chosen.threshold ? " ←" : "  "}          ${pct(r.correctRefusalRate)}               ${pct(r.falseRefusalRate)}              ${pct(r.balancedAccuracy)}`);
  }
  console.log(`\nChosen: ${chosen.threshold.toFixed(2)} (highest balanced accuracy, ties broken low) · cost $${result.costUsd.toFixed(8)}`);
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
});
