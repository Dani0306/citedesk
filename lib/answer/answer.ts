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

/**
 * Prompt caching (T38). "implicit" is OpenAI's default: the whole prompt is cache-written (1.25×
 * input) so an exact repeat reads it back at 0.1×. "off" sends explicit mode with no breakpoint,
 * which per the provider docs disables caching. Which is cheaper depends on how often questions
 * repeat; `npm run eval:cache` measures the break-even.
 */
export type CacheMode = "implicit" | "off";

/** Provider options shared by every OpenAI call: nothing stored, and caching as configured. */
export function openaiOptions(cacheMode: CacheMode) {
  return { openai: { store: false, ...(cacheMode === "off" ? { promptCacheOptions: { mode: "explicit" as const } } : {}) } };
}

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
  cacheMode: CacheMode;
};

export type GenerateFn = (args: {
  model: string;
  instructions: string;
  prompt: string;
  reasoning: Reasoning;
  maxOutputTokens: number;
  cacheMode: CacheMode;
}) => Promise<{ text: string; usage: LanguageModelUsage; finishReason: string }>;

/** The real answer call. store: false, because nothing needs the generation kept at OpenAI. */
export const openaiGenerate: GenerateFn = ({ model, instructions, prompt, reasoning, maxOutputTokens, cacheMode }) =>
  generateText({
    model: openai(model),
    instructions,
    prompt,
    reasoning,
    maxOutputTokens,
    timeout: 30_000,
    providerOptions: openaiOptions(cacheMode),
    telemetry: { functionId: "citedesk.answer" },
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

/** Everything retrieval, the gate and the rerank need; the answer call is added by the caller. */
export type PrepareDeps = {
  embed: EmbedFn;
  match: MatchFn;
  keyword?: KeywordFn;
  rerank?: RerankFn;
  sink: CallSink;
  now?: () => number;
};

export type AnswerDeps = PrepareDeps & { generate: GenerateFn };

export type Refusal = Extract<AnswerResult, { kind: "refusal" }>;

/** Retrieval passed the gate: the prompt is built and the chunks are numbered as in it. */
export type Ready = Omit<Common, "latencyMs"> & {
  kind: "ready";
  topVector: RankedChunk | null;
  instructions: string;
  prompt: string;
  /** Milliseconds since the question arrived. */
  latency: () => number;
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
    cacheMode: "implicit",
  };
}

/** retrieve → gate → rerank → prompt. A refusal is final: no answer call follows it. */
export async function prepareAnswer(rawQuestion: string, deps: PrepareDeps, config: AnswerConfig = defaultConfig()): Promise<Ready | Refusal> {
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
      { model: config.answerModel, topN: config.k, maxTokensPerCandidate: 300, reasoning: "low", maxOutputTokens: 1000, cacheMode: config.cacheMode },
      { rerank: deps.rerank!, sink: deps.sink },
    );
    ordered = r.chunks;
    rerankStatus = r.status;
  }
  const retrieved = ordered.slice(0, config.k).map((c, i) => ({ ...c, rank: i + 1 }));
  const { instructions, prompt } = buildAnswerPrompt(question, retrieved);
  return { ...base, kind: "ready", retrieved, rerankStatus, topVector, instructions, prompt, latency };
}

/** The model's finished text → an answer with checked citations, or the model's own refusal. */
export function finishAnswer(ready: Ready, generation: { text: string; finishReason: string }): AnswerResult {
  const { question, config, retrieved, topVectorSimilarity, rerankStatus, topVector, latency } = ready;
  const done = { question, config, retrieved, topVectorSimilarity, rerankStatus };
  if (isModelRefusal(generation.text)) {
    return { ...done, kind: "refusal", reason: "not_in_sources", closest: closestSection(topVector ?? done.retrieved[0]), latencyMs: latency() };
  }
  return {
    ...done,
    kind: "answer",
    answer: generation.text,
    citations: checkCitations(generation.text, done.retrieved),
    finishReason: generation.finishReason,
    latencyMs: latency(),
  };
}

export async function answerQuestion(rawQuestion: string, deps: AnswerDeps, config: AnswerConfig = defaultConfig()): Promise<AnswerResult> {
  const ready = await prepareAnswer(rawQuestion, deps, config);
  if (ready.kind === "refusal") return ready;
  const result = await recordCall(
    deps.sink,
    { purpose: "answer", model: config.answerModel },
    () =>
      deps.generate({
        model: config.answerModel,
        instructions: ready.instructions,
        prompt: ready.prompt,
        reasoning: config.reasoning,
        maxOutputTokens: config.maxOutputTokens,
        cacheMode: config.cacheMode,
      }),
    fromText,
  );
  return finishAnswer(ready, result);
}
