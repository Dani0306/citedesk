import { createHash } from "node:crypto";
import { z } from "zod";

// Zod schemas for everything the evals read and write. evals/questions.json is the source of
// truth for questions and labels; run files in evals/runs/ are the source of truth for every
// number in the README. The app never imports evals/.

export const Question = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "ids are lowercase letters, digits and dashes"),
    question: z.string().trim().min(1).max(2000),
    answerable: z.boolean(),
    /** chunk_keys (or live URLs with an #anchor) of the sections that answer it. */
    expected: z.array(z.string().trim().min(1)),
    tags: z.array(z.string().min(1)).default([]),
    note: z.string().optional(),
  })
  .refine((q) => q.answerable === q.expected.length > 0, {
    message: "an answerable question needs at least one expected key; an unanswerable one needs none",
    path: ["expected"],
  });
export type Question = z.infer<typeof Question>;

export const QuestionSet = z.object({ version: z.literal(1), questions: z.array(Question) });
export type QuestionSet = z.infer<typeof QuestionSet>;

/** Changes when anything that affects scoring changes; tags and notes don't count. */
export function questionsHash(set: QuestionSet): string {
  const scored = set.questions.map(({ id, question, answerable, expected }) => ({ id, question, answerable, expected }));
  return createHash("sha256").update(JSON.stringify(scored)).digest("hex");
}

const unit = z.number().min(0).max(1);

export const Metrics = z.object({
  recallAt5: unit,
  /** What reaches the answer model (k = 8, prompt 005). Not a headline metric. */
  recallAt8: unit,
  recallAt20: unit,
  mrr: unit,
  ndcgAt10: unit,
});
export type Metrics = z.infer<typeof Metrics>;

export const RetrievalStage = z.object({
  retrievedLabelledAt5: z.boolean(),
  retrievedLabelledAt8: z.boolean(),
  retrievedLabelledAt20: z.boolean(),
});

export const QuestionResult = z.object({
  id: z.string(),
  question: z.string(),
  tags: z.array(z.string()),
  expected: z.array(z.string()),
  retrieved: z.array(z.object({ chunkKey: z.string(), similarity: z.number(), rank: z.number().int().positive() })),
  firstRelevantRank: z.number().int().positive().nullable(),
  metrics: Metrics,
  /** One entry per pipeline stage; generation and judge runs add theirs. */
  stage: z.object({ retrieval: RetrievalStage }),
  latencyMs: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
});
export type QuestionResult = z.infer<typeof QuestionResult>;

export const RetrievalRun = z.object({
  kind: z.literal("retrieval"),
  createdAt: z.iso.datetime(),
  gitSha: z.string().min(1),
  note: z.string().nullable(),
  config: z.object({ name: z.string().min(1), k: z.number().int().positive() }).catchall(z.unknown()),
  models: z.object({ embedding: z.string().min(1) }),
  pricesReadOn: z.iso.date(),
  questionsHash: z.string().length(64),
  /** Answerable questions scored; unanswerable ones are skipped by retrieval runs. */
  questionCount: z.number().int().positive(),
  skippedUnanswerable: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  costPerQueryUsd: z.number().nonnegative(),
  latencyMs: z.object({ p50: z.number().int().nonnegative(), p95: z.number().int().nonnegative() }),
  metrics: Metrics,
  perQuestion: z.array(QuestionResult),
});
export type RetrievalRun = z.infer<typeof RetrievalRun>;
