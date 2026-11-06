import { openai } from "@ai-sdk/openai";
import { generateText, type LanguageModelUsage } from "ai";
import { z } from "zod";
import { fromText, recordCall, type CallSink } from "../calls/record";
import type { EmbedFn } from "../ingest/embed";
import { answerModel } from "../models";
import { searchCandidates, type RetrievalMode } from "../retrieve/hybrid";
import type { KeywordFn } from "../retrieve/keyword";
import { RERANK_PROMPT_VERSION, rerankChunks, type RerankFn } from "../retrieve/rerank";
import { DEFAULT_RRF_K, type RankedChunk } from "../retrieve/rrf";
import type { MatchFn } from "../retrieve/vector";
import { checkCitations, type CitationCheck } from "./citations";
import { ANSWER_PROMPT_VERSION, buildAnswerPrompt } from "./prompt";
import { closestSection, gate, isModelRefusal, refusalThreshold, type ClosestSection, type RefusalReason } from "./refusal";

// One question, end to end, with every dependency injected so the script, the chat route (T28)
// and the evals run the same code: retrieve → gate → rerank → prompt → generate → validate. The
// gate runs before the rerank, so a refused question never pays for one.

export const Question = z.string().trim().min(1).max(2000);

export type Reasoning = "none" | "low" | "medium";

export type AnswerConfig = {
  retrieval: RetrievalMode;
  /** Chunks sent to the answer model. */
  k: number;
  /** Per-arm pool for hybrid and the rerank's input. */
  candidates: number;
  rrfK: number;
  rerank: boolean;
  rerankPromptVersion: number;
  threshold: number;
  thresholdSource: "env" | "provisional";
  answerModel: string;
  reasoning: Reasoning;
  maxOutputTokens: number;
  promptVersion: number;
};

export type GenerateFn = (args: {
  model: string;
  instructions: string;
  prompt: string;
  reasoning: Reasoning;
  maxOutputTokens: number;
}) => Promise<{ text: string; usage: LanguageModelUsage; finishReason: string }>;

/** The real answer call. store: false, because nothing needs the generation kept at OpenAI. */
export const openaiGenerate: GenerateFn = ({ model, instructions, prompt, reasoning, maxOutputTokens }) =>
  generateText({
    model: openai(model),
    instructions,
    prompt,
    reasoning,
    maxOutputTokens,
    timeout: 30_000,
    providerOptions: { openai: { store: false } },
  });

type Common = {
  question: string;
  config: AnswerConfig;
  /** The chunks the answer model saw (or would have seen), numbered as in the prompt. */
  retrieved: RankedChunk[];
  topVectorSimilarity: number | null;
  rerankStatus: "off" | "applied" | "skipped";
  latencyMs: number;
};

export type AnswerResult =
  | (Common & { kind: "answer"; answer: string; citations: CitationCheck; finishReason: string })
  | (Common & { kind: "refusal"; reason: RefusalReason; closest: ClosestSection | null });

export type AnswerDeps = {
  embed: EmbedFn;
  match: MatchFn;
  keyword?: KeywordFn;
  rerank?: RerankFn;
  generate: GenerateFn;
  sink: CallSink;
  now?: () => number;
};

export function defaultConfig(env: Record<string, string | undefined> = process.env): AnswerConfig {
  const threshold = refusalThreshold(env);
  return {
    // Hybrid and rerank are built (prompt 007); the default switches once T26's ablation decides.
    retrieval: "vector",
    k: 8,
    candidates: 50,
    rrfK: DEFAULT_RRF_K,
    rerank: false,
    rerankPromptVersion: RERANK_PROMPT_VERSION,
    threshold: threshold.value,
    thresholdSource: threshold.source,
    answerModel: answerModel(),
    reasoning: "low",
    maxOutputTokens: 1500,
    promptVersion: ANSWER_PROMPT_VERSION,
  };
}

export async function answerQuestion(
  rawQuestion: string,
  deps: AnswerDeps,
  config: AnswerConfig = defaultConfig(),
): Promise<AnswerResult> {
  const now = deps.now ?? (() => performance.now());
  const start = now();
  const question = Question.parse(rawQuestion);
  if (config.rerank && !deps.rerank) throw new Error("config.rerank is on but no rerank function was given");
  const pool = config.retrieval === "hybrid" || config.rerank ? config.candidates : config.k;
  const { chunks, topVector } = await searchCandidates(question, { mode: config.retrieval, count: pool, rrfK: config.rrfK }, deps);
  const latency = () => Math.round(now() - start);
  const base = { question, config, topVectorSimilarity: topVector?.similarity ?? null };

  const before = gate(topVector?.similarity ?? null, config.threshold);
  if (before) {
    return {
      ...base,
      retrieved: chunks.slice(0, config.k),
      rerankStatus: config.rerank ? "skipped" : "off",
      kind: "refusal",
      reason: before,
      closest: topVector ? closestSection(topVector) : null,
      latencyMs: latency(),
    };
  }

  let ordered = chunks;
  let rerankStatus: Common["rerankStatus"] = "off";
  if (config.rerank) {
    const r = await rerankChunks(
      question,
      chunks,
      { model: config.answerModel, topN: config.k, maxTokensPerCandidate: 300, reasoning: "low", maxOutputTokens: 1000 },
      { rerank: deps.rerank!, sink: deps.sink },
    );
    ordered = r.chunks;
    rerankStatus = r.status;
  }
  const retrieved = ordered.slice(0, config.k).map((c, i) => ({ ...c, rank: i + 1 }));
  const done = { ...base, retrieved, rerankStatus };

  const { instructions, prompt } = buildAnswerPrompt(question, retrieved);
  const result = await recordCall(
    deps.sink,
    { purpose: "answer", model: config.answerModel },
    () => deps.generate({ model: config.answerModel, instructions, prompt, reasoning: config.reasoning, maxOutputTokens: config.maxOutputTokens }),
    fromText,
  );

  if (isModelRefusal(result.text)) {
    return { ...done, kind: "refusal", reason: "not_in_sources", closest: closestSection(topVector ?? retrieved[0]), latencyMs: latency() };
  }
  return {
    ...done,
    kind: "answer",
    answer: result.text,
    citations: checkCitations(result.text, retrieved),
    finishReason: result.finishReason,
    latencyMs: latency(),
  };
}
