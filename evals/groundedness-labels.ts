import { createHash } from "node:crypto";
import type { GenerationQuestion, GenerationRun, GroundednessLabelFile } from "./schema";

// The human groundedness labels (T35): which answers get labelled, and how a label is tied to the
// exact sentence it was given for. A label is keyed by question, sentence index and a hash of the
// sentence text, so a re-generated or edited sentence never inherits a label meant for another.

export const LABELLED_OUTPUTS = 30;

export function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** The outputs to label: the first N answered questions in run order (answerable or not). */
export function outputsToLabel(run: GenerationRun, limit = LABELLED_OUTPUTS): GenerationQuestion[] {
  return run.perQuestion.filter((q) => q.answer !== null && q.sentences.length > 0).slice(0, limit);
}

export type Pending = { question: GenerationQuestion; sentence: GenerationQuestion["sentences"][number]; evidence: GenerationQuestion["sources"] };

/** Sentences still waiting for a human label, each with only the passages it cites. */
export function pendingLabels(run: GenerationRun, file: GroundednessLabelFile, limit = LABELLED_OUTPUTS): Pending[] {
  const done = new Set(file.labels.map((l) => `${l.questionId}#${l.index}#${l.textHash}`));
  return outputsToLabel(run, limit).flatMap((question) =>
    question.sentences
      .filter((s) => !done.has(`${question.id}#${s.index}#${textHash(s.text)}`))
      .map((sentence) => ({ question, sentence, evidence: question.sources.filter((src) => sentence.markers.includes(src.n)) })),
  );
}

/** Labels whose sentence still matches the run, and how many no longer do. */
export function matchLabels(run: GenerationRun, file: GroundednessLabelFile) {
  const byKey = new Map(run.perQuestion.flatMap((q) => q.sentences.map((s) => [`${q.id}#${s.index}`, textHash(s.text)] as const)));
  const current = file.labels.filter((l) => byKey.get(`${l.questionId}#${l.index}`) === l.textHash);
  return { current, stale: file.labels.length - current.length };
}
