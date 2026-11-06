// npm run corpus:check-anchors — fetch each live docs page and check that every anchor the loader
// produced exists there as an id. Public pages only, one at a time, with a pause between them.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CORPUS, pageUrl } from "../lib/ingest/corpus";
import { listCorpusFiles, partialReader } from "../lib/ingest/files";
import { parseMdx } from "../lib/ingest/mdx";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");

async function main() {
  const read = partialReader();
  let checked = 0;
  let matched = 0;
  const mismatches: { page: string; anchor: string; heading: string }[] = [];
  const pageErrors: { page: string; status: number }[] = [];

  for (const [rel, file] of listCorpusFiles()) {
    const sections = parseMdx(readFileSync(file, "utf8"), read).sections.filter((s) => s.anchor);
    const res = await fetch(pageUrl(rel));
    if (!res.ok) {
      pageErrors.push({ page: rel, status: res.status });
      await sleep(300);
      continue;
    }
    const ids = new Set([...(await res.text()).matchAll(/\sid="([^"]+)"/g)].map((m) => decode(m[1])));
    for (const s of sections) {
      checked++;
      if (ids.has(s.anchor)) matched++;
      else mismatches.push({ page: rel, anchor: s.anchor, heading: s.headingPath.at(-1) ?? "" });
    }
    await sleep(300);
  }

  const pct = checked ? ((matched / checked) * 100).toFixed(1) : "0";
  console.log(`Anchors checked against supabase.com (corpus pinned at ${CORPUS.commit.slice(0, 7)}; the live site may be newer):`);
  console.log(`  ${matched} of ${checked} match exactly (${pct}%), ${mismatches.length} mismatches, ${pageErrors.length} pages unreachable`);
  for (const m of mismatches.slice(0, 40)) console.log(`  ✗ ${m.page}#${m.anchor}  ("${m.heading}")`);
  if (mismatches.length > 40) console.log(`  … and ${mismatches.length - 40} more in logs/anchor-check.json`);
  for (const e of pageErrors) console.log(`  ! ${e.page} → HTTP ${e.status}`);

  mkdirSync(path.join(process.cwd(), "logs"), { recursive: true });
  writeFileSync(
    path.join(process.cwd(), "logs", "anchor-check.json"),
    JSON.stringify({ at: new Date().toISOString(), commit: CORPUS.commit, checked, matched, mismatches, pageErrors }, null, 2),
  );
}

main();
