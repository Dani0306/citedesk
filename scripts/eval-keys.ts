// npm run eval:keys database/postgres/indexes — the chunk_keys under a page (or any prefix), to
// label questions with. Shows each key's heading path, size and the sub-headings merged into it.
// It deliberately never shows search results: labels taken from the system under test inflate recall.
import { loadChunkRows } from "../evals/inputs";

async function main() {
  const prefix = process.argv[2]?.trim().replace(/^https:\/\/supabase\.com\/docs\/guides\//, "").split("#")[0];
  if (!prefix) throw new Error("Usage: npm run eval:keys <page path or prefix>, e.g. database/postgres/indexes");

  const byKey = new Map<string, { path: string[]; tokens: number; chunks: number; merged: string[] }>();
  for (const row of await loadChunkRows()) {
    if (!row.chunk_key.startsWith(prefix)) continue;
    const entry = byKey.get(row.chunk_key) ?? { path: row.heading_path, tokens: 0, chunks: 0, merged: [] };
    entry.tokens += row.token_count;
    entry.chunks += 1;
    let inFence = false;
    for (const line of row.content.split("\n")) {
      if (/^\s*(`{3,}|~{3,})/.test(line)) inFence = !inFence;
      const h = !inFence && line.match(/^(#{2,6})\s+(.+)$/);
      if (h && !entry.merged.includes(h[2])) entry.merged.push(h[2]);
    }
    byKey.set(row.chunk_key, entry);
  }
  if (byKey.size === 0) throw new Error(`No chunk_keys start with "${prefix}"`);

  for (const [key, e] of [...byKey].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${key}`);
    console.log(`  ${e.path.join(" › ")}  (${e.tokens} tokens${e.chunks > 1 ? `, ${e.chunks} chunks` : ""})`);
    if (e.merged.length) console.log(`  also covers: ${e.merged.join(" · ")}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
