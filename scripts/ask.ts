// npm run ask [-- --retrieval=hybrid] [--rerank] "How do I create a partial index?" — one question
// end to end: retrieval (vector by default), the refusal gate, an optional rerank, a cited
// gpt-6-luna answer, citation checks, and one query_log row with its model calls linked.
// About $0.0003–$0.0014 per answer, plus ~$0.0015 with --rerank; a refusal costs only the embedding.
import { answerQuestion, defaultConfig, openaiGenerate, type AnswerResult } from "../lib/answer/answer";
import { sourceTitle } from "../lib/answer/prompt";
import { combineSinks, dbSink, jsonlSink, memorySink } from "../lib/calls/sinks";
import { db } from "../lib/db/client";
import { persistQuery, supabaseInsertQueryLog } from "../lib/db/query-log";
import { openaiEmbed } from "../lib/ingest/embed";
import { supabaseKeyword } from "../lib/retrieve/keyword";
import { openaiRerank } from "../lib/retrieve/rerank";
import { supabaseMatch } from "../lib/retrieve/vector";

function print(result: AnswerResult, queryId: number | null, costUsd: number) {
  const { config } = result;
  console.log(`\n${result.question}\n`);
  if (result.kind === "refusal") {
    console.log(`I don't know.  (reason: ${result.reason})`);
    if (result.closest) {
      console.log(`\nClosest section (${result.closest.similarity.toFixed(3)}): ${result.closest.title}`);
      console.log(`  ${result.closest.url}`);
      console.log(`  ${result.closest.snippet}`);
    }
  } else {
    console.log(result.answer);
    const cited = new Set(result.citations.cited.map((c) => c.n));
    console.log("\nSources");
    result.retrieved.forEach((c, i) => {
      const arms = config.retrieval === "hybrid" ? `  v${c.vectorRank ?? "–"} k${c.keywordRank ?? "–"}` : "";
      console.log(`  ${cited.has(i + 1) ? "✓" : " "} [${i + 1}] ${c.similarity.toFixed(3)}${arms}  ${sourceTitle(c)}`);
      console.log(`        ${c.sourceUrl}`);
    });
    console.log(`\nInvalid markers: ${result.citations.invalid.length ? result.citations.invalid.map((n) => `[${n}]`).join(" ") : "none"}`);
    console.log(`Uncited sentences (heuristic): ${result.citations.uncitedSentences}`);
    if (result.finishReason !== "stop") console.log(`Finish reason: ${result.finishReason}`);
  }
  console.log(
    `\n${config.retrieval}${config.rerank ? ` + rerank ${result.rerankStatus}` : ""}` +
      ` · top vector ${result.topVectorSimilarity?.toFixed(3) ?? "—"} vs threshold ${config.threshold} (${config.thresholdSource})` +
      ` · ${config.answerModel}, reasoning ${config.reasoning} · $${costUsd.toFixed(8)} ·${result.latencyMs} ms · query_log ${queryId}`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith("--"));
  const question = args.filter((a) => !a.startsWith("--")).join(" ").trim();
  if (!question) throw new Error('Usage: npm run ask [-- --retrieval=hybrid] [--rerank] "your question"');
  const retrieval = flags.find((f) => f.startsWith("--retrieval="))?.split("=")[1] ?? "vector";
  if (retrieval !== "vector" && retrieval !== "hybrid") throw new Error("--retrieval must be vector or hybrid");
  const config = { ...defaultConfig(), retrieval, rerank: flags.includes("--rerank") } as const;

  const buffer = memorySink();
  let result: AnswerResult | null = null;
  let queryId: number | null = null;
  try {
    result = await answerQuestion(question, {
      embed: openaiEmbed,
      match: supabaseMatch(db()),
      keyword: supabaseKeyword(db()),
      rerank: openaiRerank,
      generate: openaiGenerate,
      sink: buffer.sink,
    }, config);
  } finally {
    queryId = await persistQuery(
      { insertQueryLog: supabaseInsertQueryLog(db()), sink: combineSinks(jsonlSink(), dbSink(db())) },
      result,
      buffer.records,
    );
  }
  print(result, queryId, buffer.records.reduce((total, r) => total + r.costUsd, 0));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
