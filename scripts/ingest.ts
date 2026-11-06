// npm run ingest            — dry run: what would be redone, and what it would cost
// npm run ingest -- --yes   — embed and write (aborts if the estimate is above --max-usd, default 0.10)
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { ModelCallRecord } from "../lib/calls/record";
import { combineSinks, dbSink, jsonlSink } from "../lib/calls/sinks";
import { db } from "../lib/db/client";
import { unwrap } from "../lib/db/result";
import { CHUNKING, chunkingHash, chunkPage, countTokens } from "../lib/ingest/chunk";
import { CORPUS, pageUrl } from "../lib/ingest/corpus";
import { openaiEmbed, embedAll } from "../lib/ingest/embed";
import { listCorpusFiles, partialReader } from "../lib/ingest/files";
import { inlinePartials, parseMdx } from "../lib/ingest/mdx";
import { contentHash, makePlan, StoredSource, type CorpusFile } from "../lib/ingest/plan";

const args = process.argv.slice(2);
const yes = args.includes("--yes");
const maxUsd = Number(args.find((a) => a.startsWith("--max-usd="))?.split("=")[1] ?? "0.10");

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

async function main() {
  const read = partialReader();
  const hash = chunkingHash();
  const files: CorpusFile[] = listCorpusFiles().map(([rel, abs]) => {
    const raw = readFileSync(abs, "utf8");
    return {
      rel,
      sourceUrl: pageUrl(rel),
      // Hash the page as rendered, partials included, so an edited partial redoes its pages.
      contentHash: contentHash(inlinePartials(raw, read)),
      chunks: chunkPage(rel, parseMdx(raw, read)),
    };
  });

  const stored = StoredSource.array().parse(unwrap(await db().from("sources").select("id,path,content_hash,chunking_hash")) ?? []);
  const plan = makePlan(files, stored, hash, countTokens);

  const all = files.flatMap((f) => f.chunks).map((c) => c.tokenCount).sort((a, b) => a - b);
  console.log(`Corpus ${CORPUS.commit.slice(0, 7)}: ${files.length} files, ${all.length} chunks`);
  console.log(
    `  chunk tokens: min ${all[0]}, median ${percentile(all, 0.5)}, p90 ${percentile(all, 0.9)}, max ${all.at(-1)}; ` +
      `${all.filter((t) => t < CHUNKING.minTokens).length} below ${CHUNKING.minTokens}, ${all.filter((t) => t > CHUNKING.maxTokens).length} above ${CHUNKING.maxTokens}`,
  );
  console.log(`Plan: redo ${plan.redo.length} files (${plan.chunkCount} chunks), skip ${plan.skip.length}, remove ${plan.remove.length}`);
  for (const s of plan.remove) console.log(`  remove ${s.path}`);
  console.log(`  embedding ${plan.embedTokens} tokens ≈ $${plan.estimatedUsd.toFixed(6)} (estimate; the API's usage decides the real cost)`);

  if (!yes) return console.log("Dry run. Re-run with --yes to embed and write.");
  if (plan.estimatedUsd > maxUsd) throw new Error(`Estimate $${plan.estimatedUsd} is above --max-usd=${maxUsd}; nothing was spent.`);

  if (plan.remove.length) unwrap(await db().from("sources").delete().in("id", plan.remove.map((s) => s.id)));
  if (!plan.redo.length) return console.log("Nothing to embed. $0 spent.");

  const records: ModelCallRecord[] = [];
  const sink = combineSinks(jsonlSink(), dbSink(db()), async (r) => void records.push(r));
  const texts = plan.redo.flatMap((f) => f.chunks.map((c) => c.embedText));
  const embeddings = await embedAll(texts, {
    embed: openaiEmbed,
    sink,
    onBatch: (done, total) => console.log(`  embedded ${done}/${total}`),
  });

  // Write order makes a crash safe: the real hashes are written last, so an interrupted file
  // still looks changed and the next run redoes it.
  let k = 0;
  for (const f of plan.redo) {
    const row = unwrap(
      await db()
        .from("sources")
        .upsert({ path: f.rel, source_url: f.sourceUrl, commit_sha: CORPUS.commit, content_hash: "", chunking_hash: "" }, { onConflict: "path" })
        .select("id")
        .single(),
    );
    const { id } = z.object({ id: z.number().int() }).parse(row);
    unwrap(await db().from("chunks").delete().eq("source_id", id));
    const rows = f.chunks.map((c) => ({
      source_id: id,
      ordinal: c.ordinal,
      chunk_key: c.chunkKey,
      heading_path: c.headingPath,
      anchor: c.anchor,
      source_url: c.sourceUrl,
      content: c.content,
      token_count: c.tokenCount,
      embedding: embeddings[k++],
    }));
    for (let i = 0; i < rows.length; i += 100) unwrap(await db().from("chunks").insert(rows.slice(i, i + 100)));
    unwrap(
      await db()
        .from("sources")
        .update({ content_hash: f.contentHash, chunking_hash: hash, ingested_at: new Date().toISOString() })
        .eq("id", id),
    );
  }

  const tokens = records.reduce((n, r) => n + r.inputTokens, 0);
  const cost = records.reduce((n, r) => n + r.costUsd, 0);
  console.log(`Done: ${plan.redo.length} files, ${k} chunks written. ${records.length} embedding calls, ${tokens} tokens, $${cost.toFixed(6)} (from API usage).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
