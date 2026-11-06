// npm run ask "How do I create a partial index?" — one question end to end (Phase 3): vector
// retrieval, the refusal gate, a cited gpt-6-luna answer, citation checks, and one query_log row
// with its model calls linked. About $0.0003–$0.0014 per answer; a refusal costs only the embedding.
import { answerQuestion, openaiGenerate, type AnswerResult } from "../lib/answer/answer";
import { sourceTitle } from "../lib/answer/prompt";
import { combineSinks, dbSink, jsonlSink, memorySink } from "../lib/calls/sinks";
import { db } from "../lib/db/client";
import { persistQuery, supabaseInsertQueryLog } from "../lib/db/query-log";
import { openaiEmbed } from "../lib/ingest/embed";
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
      console.log(`  ${cited.has(i + 1) ? "✓" : " "} [${i + 1}] ${c.similarity.toFixed(3)}  ${sourceTitle(c)}`);
      console.log(`        ${c.sourceUrl}`);
    });
    console.log(`\nInvalid markers: ${result.citations.invalid.length ? result.citations.invalid.map((n) => `[${n}]`).join(" ") : "none"}`);
    console.log(`Uncited sentences (heuristic): ${result.citations.uncitedSentences}`);
    if (result.finishReason !== "stop") console.log(`Finish reason: ${result.finishReason}`);
  }
  console.log(
    `\ntop ${result.retrieved[0]?.similarity.toFixed(3) ?? "—"} vs threshold ${config.threshold} (${config.thresholdSource})` +
      ` · ${config.answerModel}, reasoning ${config.reasoning} · $${costUsd.toFixed(6)} · ${result.latencyMs} ms · query_log ${queryId}`,
  );
}

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) throw new Error('Usage: npm run ask "your question"');

  const buffer = memorySink();
  let result: AnswerResult | null = null;
  let queryId: number | null = null;
  try {
    result = await answerQuestion(question, {
      embed: openaiEmbed,
      match: supabaseMatch(db()),
      generate: openaiGenerate,
      sink: buffer.sink,
    });
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
