import { createHash } from "node:crypto";
import { openai } from "@ai-sdk/openai";
import { generateText, NoObjectGeneratedError, Output, type LanguageModelUsage } from "ai";
import { z } from "zod";
import { fromText, recordCall, type CallSink } from "../lib/calls/record";
import { PRICING_READ_ON } from "../lib/cost/pricing";
import { seedFrom, shuffled } from "../lib/retrieve/rerank";
import { agreementStats, confusion } from "./agreement";
import { matchLabels } from "./groundedness-labels";
import { SpendCapError } from "./retrieval";
import { GROUNDEDNESS_LABELS, JudgeRun, type GenerationQuestion, type GenerationRun, type GroundednessLabel, type GroundednessLabelFile } from "./schema";

// The groundedness judge (T36). One call per answer: the rubric verbatim as the static
// instructions, then each sentence with only the passages it cites, in an order shuffled per
// sentence (judges favour what they read first). Its output is untrusted like the reranker's: every
// sentence index exactly once, with a known label, or the whole answer is invalid_output — logged
// with its tokens, excluded from agreement, never guessed.

export const JudgeOutput = z.object({
  labels: z.array(z.object({ index: z.number().int(), label: z.enum(GROUNDEDNESS_LABELS), reason: z.string() })),
});

export type JudgeFn = (args: {
  model: string;
  instructions: string;
  prompt: string;
  reasoning: "low" | "medium";
  maxOutputTokens: number;
}) => Promise<{ output: unknown; usage: LanguageModelUsage; finishReason: string }>;

export const openaiJudge: JudgeFn = async ({ model, instructions, prompt, reasoning, maxOutputTokens }) => {
  try {
    const r = await generateText({
      model: openai(model),
      instructions,
      prompt,
      output: Output.object({ schema: JudgeOutput }),
      reasoning,
      maxOutputTokens,
      timeout: 60_000,
      providerOptions: { openai: { store: false } },
    });
    return { output: r.output, usage: r.usage, finishReason: r.finishReason };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error) && error.usage) return { output: null, usage: error.usage, finishReason: error.finishReason ?? "error" };
    throw error;
  }
};

export const hashRubric = (rubric: string) => createHash("sha256").update(rubric).digest("hex");

export function buildJudgePrompt(q: GenerationQuestion, seed: number = seedFrom(q.id)): string {
  const sentences = q.sentences.map((s) => {
    const evidence = shuffled(
      q.sources.filter((src) => s.markers.includes(src.n)),
      seed + s.index,
    );
    const passages = evidence.length
      ? evidence.map((src) => `[${src.n}] ${src.headingPath.join(" › ")}\n${src.content}`).join("\n\n")
      : "(none: this sentence cites nothing)";
    return `Sentence ${s.index}: ${s.text}\nCited passages:\n${passages}`;
  });
  return `Question: ${q.question}\n\n${sentences.join("\n\n---\n\n")}\n\nLabel every sentence index above exactly once: ${q.sentences.map((s) => s.index).join(", ")}.`;
}

export function validateJudge(output: unknown, indexes: number[]): { labels: Map<number, { label: GroundednessLabel; reason: string }> } | { error: string } {
  const parsed = JudgeOutput.safeParse(output);
  if (!parsed.success) return { error: "output does not match the schema" };
  const expected = new Set(indexes);
  const labels = new Map<number, { label: GroundednessLabel; reason: string }>();
  for (const l of parsed.data.labels) {
    if (!expected.has(l.index)) return { error: `unknown sentence index ${l.index}` };
    if (labels.has(l.index)) return { error: `sentence ${l.index} labelled twice` };
    labels.set(l.index, { label: l.label, reason: l.reason });
  }
  const missing = indexes.filter((i) => !labels.has(i));
  if (missing.length) return { error: `no label for sentence ${missing.join(", ")}` };
  return { labels };
}

export async function judgeAnswer(
  q: GenerationQuestion,
  opts: { model: string; rubric: string },
  deps: { judge: JudgeFn; sink: CallSink },
): Promise<ReturnType<typeof validateJudge>> {
  const indexes = q.sentences.map((s) => s.index);
  const problem = (r: { output: unknown }) => {
    const v = validateJudge(r.output, indexes);
    return "error" in v ? v.error : null;
  };
  try {
    const r = await recordCall(
      deps.sink,
      { purpose: "judge", model: opts.model },
      () => deps.judge({ model: opts.model, instructions: opts.rubric, prompt: buildJudgePrompt(q), reasoning: "low", maxOutputTokens: 2000 }),
      fromText,
      { check: problem },
    );
    return validateJudge(r.output, indexes);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Judges exactly the human-labelled outputs of one generation run and scores agreement with the labels. */
export async function runJudge(
  gen: { file: string; run: GenerationRun },
  labelFile: GroundednessLabelFile,
  rubric: string,
  model: string,
  deps: { judge: JudgeFn; sink: CallSink },
  opts: { maxUsd: number; gitSha: string; note?: string | null; date?: Date; onAnswer?: (done: number, total: number) => void },
): Promise<JudgeRun> {
  if (labelFile.generationRun !== gen.file) {
    throw new Error(`The labels are for ${labelFile.generationRun}, not ${gen.file}: judge the run that was labelled`);
  }
  const { current, stale } = matchLabels(gen.run, labelFile);
  if (current.length === 0) throw new Error("No current human labels to compare against; run npm run eval:label first");

  let spent = 0;
  const sink: CallSink = async (record) => {
    spent += record.costUsd;
    await deps.sink(record);
  };

  const ids = [...new Set(current.map((l) => l.questionId))];
  const questions = gen.run.perQuestion.filter((q) => ids.includes(q.id));
  const verdicts = new Map<string, Map<number, { label: GroundednessLabel; reason: string }> | null>();
  for (const q of questions) {
    const v = await judgeAnswer(q, { model, rubric }, { judge: deps.judge, sink });
    verdicts.set(q.id, "error" in v ? null : v.labels);
    if (spent > opts.maxUsd) throw new SpendCapError(spent, opts.maxUsd);
    opts.onAnswer?.(verdicts.size, questions.length);
  }

  const sentences = current.map((l) => {
    const v = verdicts.get(l.questionId)?.get(l.index) ?? null;
    return { questionId: l.questionId, index: l.index, textHash: l.textHash, human: l.label, judge: v?.label ?? null, reason: v?.reason ?? null };
  });
  const matrix = confusion(sentences.filter((s) => s.judge !== null).map((s) => [s.human, s.judge!] as [GroundednessLabel, GroundednessLabel]));

  return JudgeRun.parse({
    kind: "judge",
    createdAt: (opts.date ?? new Date()).toISOString(),
    gitSha: opts.gitSha,
    note: opts.note ?? null,
    model,
    generationRun: gen.file,
    rubricHash: hashRubric(rubric),
    pricesReadOn: PRICING_READ_ON,
    costUsd: Math.round(spent * 1e8) / 1e8,
    outputsJudged: questions.length,
    invalidOutputs: [...verdicts.values()].filter((v) => v === null).length,
    staleLabels: stale,
    agreement: { ...agreementStats(matrix), matrix },
    sentences,
  });
}
