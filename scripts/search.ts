// npm run search "How do I create a partial index?" — top 5 chunks by vector similarity (T12's
// by-hand check). One query embedding (~$0.000001), logged like every other model call.
import { z } from "zod";
import { combineSinks, dbSink, jsonlSink } from "../lib/calls/sinks";
import { db } from "../lib/db/client";
import { unwrap } from "../lib/db/result";
import { embedAll, openaiEmbed } from "../lib/ingest/embed";

const Match = z.object({
  id: z.number(),
  chunk_key: z.string(),
  heading_path: z.array(z.string()),
  anchor: z.string(),
  source_url: z.string(),
  content: z.string(),
  similarity: z.number(),
});

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) throw new Error('Usage: npm run search "your question"');

  const sink = combineSinks(jsonlSink(), dbSink(db()));
  const [embedding] = await embedAll([question], { embed: openaiEmbed, sink, purpose: "embed_query" });
  const matches = z.array(Match).parse(unwrap(await db().rpc("match_documents", { query_embedding: embedding, match_count: 5 })));

  console.log(`\n${question}\n`);
  matches.forEach((m, i) => {
    console.log(`${i + 1}. ${m.similarity.toFixed(3)}  ${m.heading_path.join(" › ")}`);
    console.log(`   ${m.source_url}`);
    console.log(`   ${m.content.replace(/\s+/g, " ").slice(0, 160)}…\n`);
  });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
