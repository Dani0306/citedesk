import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { db } from "../lib/db/client";
import { unwrap } from "../lib/db/result";
import { corpusDir, listCorpusFiles, partialReader } from "../lib/ingest/files";
import { parseMdx } from "../lib/ingest/mdx";
import { checkLabels, mergedInto, type LabelProblem } from "./labels";
import { QuestionSet } from "./schema";

// What the eval scripts read: the question file, the chunk_keys in the database, and (when the
// corpus is checked out) which sub-sections were merged into which chunk. Scripts only.

export const QUESTIONS_FILE = path.join(process.cwd(), "evals", "questions.json");

export function loadQuestions(file = QUESTIONS_FILE): QuestionSet {
  return QuestionSet.parse(JSON.parse(readFileSync(file, "utf8")));
}

const ChunkRow = z.object({
  chunk_key: z.string(),
  heading_path: z.array(z.string()),
  token_count: z.number(),
  content: z.string(),
});
export type ChunkRow = z.infer<typeof ChunkRow>;

/** Every chunk, paged: PostgREST caps a response at 1,000 rows. */
export async function loadChunkRows(): Promise<ChunkRow[]> {
  const rows: ChunkRow[] = [];
  for (let from = 0; ; from += 1000) {
    const page = z.array(ChunkRow).parse(
      unwrap(await db().from("chunks").select("chunk_key,heading_path,token_count,content").order("id").range(from, from + 999)) ?? [],
    );
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

/** Null when the corpus isn't checked out (npm run corpus:fetch); the check then can't name parents. */
export function loadMergedInto(): Map<string, string> | null {
  if (!existsSync(corpusDir())) return null;
  const read = partialReader();
  return mergedInto(listCorpusFiles().map(([rel, abs]) => ({ rel, page: parseMdx(readFileSync(abs, "utf8"), read) })));
}

export async function validateQuestions(set: QuestionSet): Promise<{ problems: LabelProblem[]; ownersKnown: boolean }> {
  const known = new Set((await loadChunkRows()).map((r) => r.chunk_key));
  if (known.size === 0) throw new Error("citedesk.chunks is empty; run npm run ingest first");
  const owners = loadMergedInto();
  return { problems: checkLabels(set, known, owners ?? new Map()), ownersKnown: owners !== null };
}
