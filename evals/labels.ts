import { groupSections } from "../lib/ingest/chunk";
import { chunkKey, CORPUS } from "../lib/ingest/corpus";
import type { ParsedPage } from "../lib/ingest/mdx";
import type { QuestionSet } from "./schema";

// Label normalisation and checking: the one place a label's spelling is decided. A label is a
// chunk_key (`database/postgres/indexes#partial-indexes`) or the live URL of that section; both
// mean the same key. The scorer compares normalised keys exactly and never remaps one silently.

const GUIDES = new URL(`${CORPUS.urlBase}/`);

export function normaliseLabel(raw: string): string {
  let label = raw.trim();
  if (/^https?:\/\//i.test(label)) {
    const url = new URL(label);
    if (url.host !== GUIDES.host || !url.pathname.startsWith(GUIDES.pathname)) {
      throw new Error(`Not a page of the corpus: ${raw}`);
    }
    label = url.pathname.slice(GUIDES.pathname.length) + url.hash;
  }
  const [path, anchor = ""] = label.replace(/^\/+/, "").split("#", 2);
  return chunkKey(path.replace(/\/+$/, ""), anchor);
}

/**
 * Maps the key of every sub-section merged into a parent's chunk to the parent's key, so the
 * check can say which key to label instead. Keys that head their own chunk are not in the map.
 */
export function mergedInto(pages: { rel: string; page: ParsedPage }[]): Map<string, string> {
  const owners = new Map<string, string>();
  for (const { rel, page } of pages) {
    for (const group of groupSections(page.sections)) {
      for (const anchor of group.anchors.slice(1)) owners.set(chunkKey(rel, anchor), chunkKey(rel, group.head.anchor));
    }
  }
  return owners;
}

export type LabelProblem = { id: string; message: string };

/** Every problem in the set, not just the first. An empty list means the labels are usable. */
export function checkLabels(set: QuestionSet, knownKeys: Set<string>, owners: Map<string, string> = new Map()): LabelProblem[] {
  const problems: LabelProblem[] = [];
  const ids = new Set<string>();
  const texts = new Map<string, string>();
  for (const q of set.questions) {
    if (ids.has(q.id)) problems.push({ id: q.id, message: "duplicate id" });
    ids.add(q.id);
    const text = q.question.trim().toLowerCase().replace(/\s+/g, " ");
    const twin = texts.get(text);
    if (twin) problems.push({ id: q.id, message: `same question as ${twin}` });
    else texts.set(text, q.id);

    const seen = new Set<string>();
    for (const raw of q.expected) {
      let key: string;
      try {
        key = normaliseLabel(raw);
      } catch (e) {
        problems.push({ id: q.id, message: (e as Error).message });
        continue;
      }
      if (seen.has(key)) problems.push({ id: q.id, message: `${key} is listed twice` });
      seen.add(key);
      if (knownKeys.has(key)) continue;
      const owner = owners.get(key);
      problems.push({
        id: q.id,
        message: owner
          ? `${key} is merged into its parent's chunk; label ${owner} instead`
          : `${key} is not a chunk_key; run npm run eval:keys ${key.split("#")[0]} to see the page's keys`,
      });
    }
  }
  return problems;
}
