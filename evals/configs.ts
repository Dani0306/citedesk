import type { CallSink } from "../lib/calls/record";
import { callCostUsd } from "../lib/cost/pricing";
import { countTokens } from "../lib/ingest/chunk";
import type { EmbedFn } from "../lib/ingest/embed";
import { answerModel, EMBEDDING_MODEL } from "../lib/models";
import { searchCandidates } from "../lib/retrieve/hybrid";
import type { KeywordFn } from "../lib/retrieve/keyword";
import { RERANK_PROMPT_VERSION, rerankChunks, seedFrom, type RerankFn } from "../lib/retrieve/rerank";
import { DEFAULT_RRF_K, type RankedChunk } from "../lib/retrieve/rrf";
import type { MatchFn } from "../lib/retrieve/vector";
import type { QuestionSet } from "./schema";

// Retrieval configurations compared in the ablation table. Each one returns at least its top 20
// so recall@20 is measurable, prices its own worst case, and carries its own default spend cap.

export type RetrievalDeps = { embed: EmbedFn; match: MatchFn; keyword: KeywordFn; rerank: RerankFn; sink: CallSink };

export type RerankStatus = "off" | "applied" | "skipped";

export type RetrievalConfig = {
  name: string;
  /** Recorded in the run file as-is. */
  params: { k: number } & Record<string, unknown>;
  models: { embedding: string; rerank: string | null };
  defaultMaxUsd: number;
  /** Upper bound for one run over the set's answerable questions. */
  estimateUsd: (set: QuestionSet) => number;
  retrieve: (question: string, deps: RetrievalDeps, ctx: { questionId: string }) => Promise<{ chunks: RankedChunk[]; rerankStatus: RerankStatus }>;
};

export const EVAL_K = 20;
const CANDIDATES = 50;
const RERANK = { topN: 8, maxTokensPerCandidate: 300, reasoning: "low", maxOutputTokens: 1000 } as const;

const answerable = (set: QuestionSet) => set.questions.filter((q) => q.answerable);
const embeddingUsd = (set: QuestionSet) =>
  callCostUsd(EMBEDDING_MODEL, {
    noCacheInputTokens: answerable(set).reduce((sum, q) => sum + countTokens(q.question), 0),
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
  });
// Worst case per rerank: every candidate at the token cap plus its heading, all billed as a cache
// write (what the live calls showed, AGENTS.md §12), and every output token used.
const rerankUsdPerQuestion = (model: string) =>
  callCostUsd(model, {
    noCacheInputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: CANDIDATES * (RERANK.maxTokensPerCandidate + 20) + 400,
    outputTokens: RERANK.maxOutputTokens,
  });

export function makeConfigs(rerankModel: string = answerModel()): Record<string, RetrievalConfig> {
  return {
    vector: {
      name: "vector",
      params: { k: EVAL_K, retrieval: "vector", distance: "cosine", index: "hnsw" },
      models: { embedding: EMBEDDING_MODEL, rerank: null },
      defaultMaxUsd: 0.05,
      estimateUsd: embeddingUsd,
      retrieve: async (question, deps) => {
        const { chunks } = await searchCandidates(question, { mode: "vector", count: EVAL_K, rrfK: DEFAULT_RRF_K }, deps);
        return { chunks, rerankStatus: "off" };
      },
    },
    hybrid: {
      name: "hybrid",
      params: { k: EVAL_K, retrieval: "hybrid", candidatesPerArm: CANDIDATES, rrfK: DEFAULT_RRF_K, fts: "english, OR of lexemes, ts_rank_cd" },
      models: { embedding: EMBEDDING_MODEL, rerank: null },
      defaultMaxUsd: 0.05,
      estimateUsd: embeddingUsd,
      retrieve: async (question, deps) => {
        const { chunks } = await searchCandidates(question, { mode: "hybrid", count: CANDIDATES, rrfK: DEFAULT_RRF_K }, deps);
        return { chunks, rerankStatus: "off" };
      },
    },
    "hybrid-rerank": {
      name: "hybrid-rerank",
      params: {
        k: EVAL_K,
        retrieval: "hybrid",
        candidatesPerArm: CANDIDATES,
        rrfK: DEFAULT_RRF_K,
        rerank: "listwise",
        rerankCandidates: CANDIDATES,
        ...RERANK,
        rerankPromptVersion: RERANK_PROMPT_VERSION,
        shuffle: "seeded by question id",
      },
      models: { embedding: EMBEDDING_MODEL, rerank: rerankModel },
      defaultMaxUsd: 0.25,
      estimateUsd: (set) => embeddingUsd(set) + answerable(set).length * rerankUsdPerQuestion(rerankModel),
      retrieve: async (question, deps, { questionId }) => {
        const { chunks } = await searchCandidates(question, { mode: "hybrid", count: CANDIDATES, rrfK: DEFAULT_RRF_K }, deps);
        // Evals shuffle the candidates (position bias), reproducibly per question.
        const r = await rerankChunks(question, chunks, { model: rerankModel, ...RERANK, shuffleSeed: seedFrom(questionId) }, deps);
        return { chunks: r.chunks, rerankStatus: r.status };
      },
    },
  };
}
