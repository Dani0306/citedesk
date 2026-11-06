import { createHash } from "node:crypto";
import { z } from "zod";
import { callCostUsd } from "../cost/pricing";
import { EMBEDDING_MODEL } from "../models";
import type { Chunk, CountTokens } from "./chunk";

// Decides what an ingest run has to do, before it spends anything: a file is redone only when its
// content or the chunking settings changed, and a stored file that left the corpus is removed.

export type CorpusFile = { rel: string; sourceUrl: string; contentHash: string; chunks: Chunk[] };

export const StoredSource = z.object({
  id: z.number().int(),
  path: z.string(),
  content_hash: z.string(),
  chunking_hash: z.string(),
});
export type StoredSource = z.infer<typeof StoredSource>;

export type IngestPlan = {
  redo: CorpusFile[];
  skip: CorpusFile[];
  remove: StoredSource[];
  chunkCount: number;
  embedTokens: number;
  estimatedUsd: number;
};

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function makePlan(files: CorpusFile[], stored: StoredSource[], chunkingHash: string, count: CountTokens): IngestPlan {
  const byPath = new Map(stored.map((s) => [s.path, s]));
  const redo: CorpusFile[] = [];
  const skip: CorpusFile[] = [];
  for (const f of files) {
    const s = byPath.get(f.rel);
    if (s && s.content_hash === f.contentHash && s.chunking_hash === chunkingHash) skip.push(f);
    else redo.push(f);
  }
  const inCorpus = new Set(files.map((f) => f.rel));
  const remove = stored.filter((s) => !inCorpus.has(s.path));
  const chunks = redo.flatMap((f) => f.chunks);
  // An estimate from our own tokenizer; the real cost comes from the usage the API reports.
  const embedTokens = chunks.reduce((n, c) => n + count(c.embedText), 0);
  const estimatedUsd = callCostUsd(EMBEDDING_MODEL, {
    noCacheInputTokens: embedTokens,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
  });
  return { redo, skip, remove, chunkCount: chunks.length, embedTokens, estimatedUsd };
}
