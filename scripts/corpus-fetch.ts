// npm run corpus:fetch — a shallow, sparse, blobless checkout of the pinned Supabase docs into the
// gitignored corpus/supabase/: only the two guide sections and the partials they include.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CORPUS, SPARSE_PATHS } from "../lib/ingest/corpus";
import { corpusDir, listCorpusFiles } from "../lib/ingest/files";

const dir = corpusDir();
const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();

function report() {
  const files = listCorpusFiles(dir);
  const partials = readdirSync(path.join(dir, CORPUS.partialsRoot), { recursive: true }).filter((f) => String(f).endsWith(".mdx"));
  console.log(`corpus/supabase at ${CORPUS.commit.slice(0, 7)}: ${files.length} guide files, ${partials.length} partials`);
}

if (existsSync(path.join(dir, ".git")) && git("rev-parse", "HEAD") === CORPUS.commit) {
  console.log("Already at the pinned commit; nothing to fetch.");
} else {
  if (!existsSync(path.join(dir, ".git"))) {
    mkdirSync(dir, { recursive: true });
    git("init", "-q");
    git("remote", "add", "origin", CORPUS.repo);
  }
  git("config", "core.sparseCheckout", "true");
  writeFileSync(path.join(dir, ".git", "info", "sparse-checkout"), `${SPARSE_PATHS.join("\n")}\n`);
  git("fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", CORPUS.commit);
  git("checkout", "-q", "--force", "FETCH_HEAD");
}
report();
