// npm run eval:cache [-- --config=hybrid-rerank|vector] [--max-usd=0.05] — measures prompt caching
// (T38): the same questions asked first with implicit caching, again as exact repeats, then with
// caching off. Writes evals/runs/YYYY-MM-DD-cache.json with U, R, O and the break-even repeat share.
// About $0.02 on hybrid-rerank. Run it when nothing else has asked these questions in the last 30 minutes.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { openaiGenerate } from "../lib/answer/answer";
import { db } from "../lib/db/client";
import { openaiEmbed } from "../lib/ingest/embed";
import { supabaseKeyword } from "../lib/retrieve/keyword";
import { openaiRerank } from "../lib/retrieve/rerank";
import { supabaseMatch } from "../lib/retrieve/vector";
import { runCache } from "../evals/cache";
import { generationConfig } from "../evals/generation";
import { arg, gitSha, main, maxUsdArg, runFile, scriptSink } from "./eval-shared";

const usd = (x: number) => `$${x.toFixed(6)}`;

main(async () => {
  const name = arg("config") ?? "hybrid-rerank";
  const date = new Date();
  const run = await runCache(
    name,
    generationConfig(name),
    { embed: openaiEmbed, match: supabaseMatch(db()), keyword: supabaseKeyword(db()), rerank: openaiRerank, generate: openaiGenerate, sink: scriptSink() },
    { maxUsd: maxUsdArg(0.05), gitSha: gitSha(), note: arg("note") ?? null, date, onStep: (s) => process.stdout.write(`\r${s}      `) },
  );
  const file = runFile("cache", name, date);
  writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);

  console.log(`\n\n${name} · ${run.questions.length} questions per pass`);
  console.log("pass              cost/question   read share  write share  p50 latency");
  for (const p of run.passes) {
    console.log(`${p.pass.padEnd(17)} ${usd(p.costPerQuestionUsd).padStart(13)}   ${(p.cacheReadShare * 100).toFixed(0).padStart(8)}%  ${(p.cacheWriteShare * 100).toFixed(0).padStart(10)}%  ${String(p.p50LatencyMs).padStart(8)} ms`);
  }
  console.log(`\nU (first ask, implicit) ${usd(run.U)} · R (exact repeat) ${usd(run.R)} · O (caching off) ${usd(run.O)}`);
  console.log(
    run.breakEvenRepeatShare === null
      ? "Repeats were not cheaper than first asks: implicit caching never pays here."
      : `Implicit caching is cheaper once more than ${(run.breakEvenRepeatShare * 100).toFixed(0)}% of questions are exact repeats within 30 minutes.`,
  );
  if (run.warning) console.log(`Warning: ${run.warning}`);
  console.log(`Total $${run.costUsd.toFixed(6)} · wrote ${path.relative(process.cwd(), file)}`);
});
