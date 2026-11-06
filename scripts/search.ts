// npm run search [-- --retrieval=hybrid] "How do I create a partial index?" — the top 5 chunks
// (T12's by-hand check), by vector similarity or fused with full-text. One query embedding
// (~$0.000001), logged like every other model call.
import { combineSinks, dbSink, jsonlSink } from "../lib/calls/sinks";
import { db } from "../lib/db/client";
import { openaiEmbed } from "../lib/ingest/embed";
import { searchCandidates } from "../lib/retrieve/hybrid";
import { supabaseKeyword } from "../lib/retrieve/keyword";
import { DEFAULT_RRF_K } from "../lib/retrieve/rrf";
import { startTracing } from "../lib/telemetry";
import { supabaseMatch } from "../lib/retrieve/vector";

async function main() {
  const args = process.argv.slice(2);
  const question = args.filter((a) => !a.startsWith("--")).join(" ").trim();
  if (!question) throw new Error('Usage: npm run search [-- --retrieval=hybrid] "your question"');
  const hybrid = args.includes("--retrieval=hybrid");

  const sink = combineSinks(jsonlSink(), dbSink(db()));
  const { chunks } = await searchCandidates(
    question,
    { mode: hybrid ? "hybrid" : "vector", count: hybrid ? 50 : 5, rrfK: DEFAULT_RRF_K },
    { embed: openaiEmbed, match: supabaseMatch(db()), keyword: supabaseKeyword(db()), sink },
  );

  console.log(`\n${question}\n`);
  for (const m of chunks.slice(0, 5)) {
    const arms = hybrid ? `  v${m.vectorRank ?? "–"} k${m.keywordRank ?? "–"}` : "";
    console.log(`${m.rank}. ${m.similarity.toFixed(3)}${arms}  ${m.headingPath.join(" › ")}`);
    console.log(`   ${m.sourceUrl}`);
    console.log(`   ${m.content.replace(/\s+/g, " ").slice(0, 160)}…\n`);
  }
}

const tracing = startTracing();
main()
  .then(() => tracing.flush())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await tracing.flush().catch(() => {});
    process.exit(1);
  });
