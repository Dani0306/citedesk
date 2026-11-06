// npm run search "How do I create a partial index?" — top 5 chunks by vector similarity (T12's
// by-hand check). One query embedding (~$0.000001), logged like every other model call.
import { combineSinks, dbSink, jsonlSink } from "../lib/calls/sinks";
import { db } from "../lib/db/client";
import { openaiEmbed } from "../lib/ingest/embed";
import { supabaseMatch, vectorSearch } from "../lib/retrieve/vector";

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) throw new Error('Usage: npm run search "your question"');

  const sink = combineSinks(jsonlSink(), dbSink(db()));
  const matches = await vectorSearch(question, 5, { embed: openaiEmbed, match: supabaseMatch(db()), sink });

  console.log(`\n${question}\n`);
  for (const m of matches) {
    console.log(`${m.rank}. ${m.similarity.toFixed(3)}  ${m.headingPath.join(" › ")}`);
    console.log(`   ${m.sourceUrl}`);
    console.log(`   ${m.content.replace(/\s+/g, " ").slice(0, 160)}…\n`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
