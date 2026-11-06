import type { CallSink } from "../lib/calls/record";
import type { EmbedFn } from "../lib/ingest/embed";
import { vectorSearch, type MatchFn, type RetrievedChunk } from "../lib/retrieve/vector";

// Retrieval configurations compared in the ablation table. Each one returns its top 20 so
// recall@20 is measurable; Phase 5 adds hybrid (T24) and hybrid + rerank (T25) here.

export type RetrievalDeps = { embed: EmbedFn; match: MatchFn; sink: CallSink };

export type RetrievalConfig = {
  name: string;
  /** Recorded in the run file as-is. */
  params: { k: number } & Record<string, unknown>;
  retrieve: (question: string, deps: RetrievalDeps) => Promise<RetrievedChunk[]>;
};

export const EVAL_K = 20;

export const CONFIGS: Record<string, RetrievalConfig> = {
  vector: {
    name: "vector",
    params: { k: EVAL_K, retrieval: "vector", distance: "cosine", index: "hnsw" },
    retrieve: (question, deps) => vectorSearch(question, EVAL_K, deps),
  },
};
