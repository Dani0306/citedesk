import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { CORPUS, relPath } from "./corpus";
import type { PartialReader } from "./mdx";

export function corpusDir(): string {
  return path.join(process.cwd(), "corpus", "supabase");
}

/** Every .mdx file in the pinned guide sections, as [rel, absolute path], sorted for stable runs. */
export function listCorpusFiles(dir = corpusDir()): [string, string][] {
  const guides = path.join(dir, CORPUS.guidesRoot);
  const out: [string, string][] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".mdx")) out.push([relPath(path.relative(guides, p)), p]);
    }
  };
  for (const section of CORPUS.sections) walk(path.join(guides, section));
  return out.sort(([a], [b]) => a.localeCompare(b));
}

/** Reads `<$Partial path>` targets, refusing anything that resolves outside the partials folder. */
export function partialReader(dir = corpusDir()): PartialReader {
  const root = path.join(dir, CORPUS.partialsRoot);
  return (p) => {
    const file = path.resolve(root, p);
    if (!file.startsWith(root + path.sep)) return null;
    try {
      return readFileSync(file, "utf8");
    } catch {
      return null;
    }
  };
}
