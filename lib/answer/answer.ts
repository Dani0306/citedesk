import { openai } from "@ai-sdk/openai";
import { generateText, type LanguageModelUsage } from "ai";
import { z } from "zod";
import { fromText, recordCall, type CallSink } from "../calls/record";
import type { EmbedFn } from "../ingest/embed";
import { answerModel } from "../models";
import { vectorSearch, type MatchFn, type RetrievedChunk } from "../retrieve/vector";
import { checkCitations, type CitationCheck } from "./citations";
import { ANSWER_PROMPT_VERSION, buildAnswerPrompt } from "./prompt";
import { closestSection, gate, isModelRefusal, refusalThreshold, type ClosestSection, type RefusalReason } from "./refusal";

// One question, end to end, with every dependency injected so the script, the chat route (T28)
// and the evals run the same code: retrieve → gate → prompt → generate → validate.

export const Question = z.string().trim().min(1).max(2000);

export type Reasoning = "none" | "low" | "medium";

export type AnswerConfig = {
  retrieval: "vector";
  k: number;
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

type Common = { question: string; config: AnswerConfig; retrieved: RetrievedChunk[]; latencyMs: number };

export type AnswerResult =
  | (Common & { kind: "answer"; answer: string; citations: CitationCheck; finishReason: string })
  | (Common & { kind: "refusal"; reason: RefusalReason; closest: ClosestSection | null });

export type AnswerDeps = {
  embed: EmbedFn;
  match: MatchFn;
  generate: GenerateFn;
  sink: CallSink;
  now?: () => number;
};

export function defaultConfig(env: Record<string, string | undefined> = process.env): AnswerConfig {
  const threshold = refusalThreshold(env);
  return {
    retrieval: "vector",
    k: 8,
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
  const retrieved = await vectorSearch(question, config.k, deps);
  const done = { question, config, retrieved };
  const latency = () => Math.round(now() - start);

  const before = gate(retrieved, config.threshold);
  if (before) {
    return { ...done, kind: "refusal", reason: before, closest: retrieved[0] ? closestSection(retrieved[0]) : null, latencyMs: latency() };
  }

  const { instructions, prompt } = buildAnswerPrompt(question, retrieved);
  const result = await recordCall(
    deps.sink,
    { purpose: "answer", model: config.answerModel },
    () => deps.generate({ model: config.answerModel, instructions, prompt, reasoning: config.reasoning, maxOutputTokens: config.maxOutputTokens }),
    fromText,
  );

  if (isModelRefusal(result.text)) {
    return { ...done, kind: "refusal", reason: "not_in_sources", closest: closestSection(retrieved[0]), latencyMs: latency() };
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
