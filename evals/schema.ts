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
  rerankStatus: z.enum(["off", "applied", "skipped"]),
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
  models: z.object({ embedding: z.string().min(1), rerank: z.string().min(1).nullable() }),
  pricesReadOn: z.iso.date(),
  questionsHash: z.string().length(64),
  /** Answerable questions scored; unanswerable ones are skipped by retrieval runs. */
  questionCount: z.number().int().positive(),
  skippedUnanswerable: z.number().int().nonnegative(),
  /** Questions where the rerank failed and fused order was used instead. */
  rerankSkipped: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  costPerQueryUsd: z.number().nonnegative(),
  latencyMs: z.object({ p50: z.number().int().nonnegative(), p95: z.number().int().nonnegative() }),
  metrics: Metrics,
  perQuestion: z.array(QuestionResult),
});
export type RetrievalRun = z.infer<typeof RetrievalRun>;

// ── Generation evals (prompt 009) ────────────────────────────────────────────────────────────

export const GROUNDEDNESS_LABELS = ["supported", "unsupported", "no_claim"] as const;
export const GroundednessLabel = z.enum(GROUNDEDNESS_LABELS);
export type GroundednessLabel = z.infer<typeof GroundednessLabel>;

const rate = z.number().min(0).max(1);

export const ThresholdRow = z.object({
  threshold: z.number(),
  correctRefusalRate: rate,
  falseRefusalRate: rate,
  balancedAccuracy: rate,
});
export type ThresholdRow = z.infer<typeof ThresholdRow>;

/** T33: not a model run (one embedding per question), so it gets a file but no eval_runs row. */
export const ThresholdSweep = z.object({
  kind: z.literal("threshold"),
  createdAt: z.iso.datetime(),
  gitSha: z.string().min(1),
  note: z.string().nullable(),
  models: z.object({ embedding: z.string().min(1) }),
  pricesReadOn: z.iso.date(),
  questionsHash: z.string().length(64),
  answerableCount: z.number().int().positive(),
  unanswerableCount: z.number().int().positive(),
  costUsd: z.number().nonnegative(),
  scores: z.array(z.object({ id: z.string(), answerable: z.boolean(), tags: z.array(z.string()), topSimilarity: z.number().nullable() })),
  sweep: z.array(ThresholdRow),
  chosen: ThresholdRow,
});
export type ThresholdSweep = z.infer<typeof ThresholdSweep>;

export const GENERATION_OUTCOMES = ["answered", "correct_refusal", "false_refusal", "answered_unanswerable"] as const;

export const GenerationQuestion = z.object({
  id: z.string(),
  question: z.string(),
  answerable: z.boolean(),
  tags: z.array(z.string()),
  expected: z.array(z.string()),
  outcome: z.enum(GENERATION_OUTCOMES),
  refusalReason: z.enum(["low_score", "not_in_sources", "no_matches"]).nullable(),
  topVectorSimilarity: z.number().nullable(),
  answer: z.string().nullable(),
  sentences: z.array(z.object({ index: z.number().int().nonnegative(), text: z.string(), markers: z.array(z.number().int()) })),
  /** The chunks the answer model saw, numbered as in its prompt: what labels and the judge check against. */
  sources: z.array(z.object({ n: z.number().int().positive(), chunkKey: z.string(), headingPath: z.array(z.string()), content: z.string() })),
  citedChunkKeys: z.array(z.string()),
  /** Markers that point at no source sent: hallucinated citations. */
  invalidMarkers: z.array(z.number().int()),
  /** Cited sources whose chunk_key is labelled ÷ cited sources; null when nothing valid was cited or the question isn't answerable. */
  citationPrecision: rate.nullable(),
  /** A labelled section was among the chunks sent to the model (answerable questions only). */
  retrievedLabelled: z.boolean().nullable(),
  citedLabelled: z.boolean().nullable(),
  rerankStatus: z.enum(["off", "applied", "skipped"]),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
});
export type GenerationQuestion = z.infer<typeof GenerationQuestion>;

export const GenerationRun = z.object({
  kind: z.literal("generation"),
  createdAt: z.iso.datetime(),
  gitSha: z.string().min(1),
  note: z.string().nullable(),
  config: z.object({ name: z.string().min(1) }).catchall(z.unknown()),
  models: z.object({ embedding: z.string().min(1), answer: z.string().min(1), rerank: z.string().min(1).nullable() }),
  pricesReadOn: z.iso.date(),
  questionsHash: z.string().length(64),
  answerableCount: z.number().int().nonnegative(),
  unanswerableCount: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  metrics: z.object({
    /** Target 0, checked in code. */
    hallucinatedCitations: z.number().int().nonnegative(),
    citationPrecision: rate.nullable(),
    correctRefusalRate: rate.nullable(),
    falseRefusalRate: rate.nullable(),
    answered: z.number().int().nonnegative(),
    costPerQuestionUsd: z.number().nonnegative(),
    tokensPerAnswer: z.number().nonnegative().nullable(),
    latencyMs: z.object({ p50: z.number().int().nonnegative(), p95: z.number().int().nonnegative() }),
  }),
  perQuestion: z.array(GenerationQuestion),
});
export type GenerationRun = z.infer<typeof GenerationRun>;

export const LabelCounts = z.record(GroundednessLabel, z.record(GroundednessLabel, z.number().int().nonnegative()));

export const JudgeRun = z.object({
  kind: z.literal("judge"),
  createdAt: z.iso.datetime(),
  gitSha: z.string().min(1),
  note: z.string().nullable(),
  model: z.string().min(1),
  /** The generation run file whose outputs were labelled and judged. */
  generationRun: z.string().min(1),
  rubricHash: z.string().length(64),
  pricesReadOn: z.iso.date(),
  costUsd: z.number().nonnegative(),
  outputsJudged: z.number().int().nonnegative(),
  /** Answers whose judge output failed validation: excluded from agreement, never guessed. */
  invalidOutputs: z.number().int().nonnegative(),
  /** Human labels whose sentence no longer matches the run (by hash): excluded. */
  staleLabels: z.number().int().nonnegative(),
  agreement: z.object({
    sentences: z.number().int().nonnegative(),
    agreement: rate.nullable(),
    kappa: z.number().nullable(),
    /** matrix[human][judge] = count */
    matrix: LabelCounts,
  }),
  sentences: z.array(
    z.object({
      questionId: z.string(),
      index: z.number().int().nonnegative(),
      textHash: z.string(),
      human: GroundednessLabel,
      judge: GroundednessLabel.nullable(),
      reason: z.string().nullable(),
    }),
  ),
});
export type JudgeRun = z.infer<typeof JudgeRun>;

/** evals/labels/groundedness.json: the human labels (T35), keyed by sentence hash so a changed sentence never inherits one. */
export const GroundednessLabelFile = z.object({
  version: z.literal(1),
  generationRun: z.string().min(1),
  labels: z.array(
    z.object({
      questionId: z.string(),
      index: z.number().int().nonnegative(),
      textHash: z.string().length(16),
      label: GroundednessLabel,
      note: z.string().optional(),
    }),
  ),
});
export type GroundednessLabelFile = z.infer<typeof GroundednessLabelFile>;

// ── Prompt-caching measurement (prompt 010, T38) ─────────────────────────────────────────────

const Call = z.object({
  purpose: z.string(),
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
});

export const CacheRun = z.object({
  kind: z.literal("cache"),
  createdAt: z.iso.datetime(),
  gitSha: z.string().min(1),
  note: z.string().nullable(),
  config: z.object({ name: z.string().min(1) }).catchall(z.unknown()),
  pricesReadOn: z.iso.date(),
  questions: z.array(z.string()),
  costUsd: z.number().nonnegative(),
  passes: z.array(
    z.object({
      pass: z.enum(["implicit-first", "implicit-repeat", "off"]),
      perQuestion: z.array(z.object({ question: z.string(), refused: z.boolean(), costUsd: z.number().nonnegative(), latencyMs: z.number().int().nonnegative(), calls: z.array(Call) })),
      costPerQuestionUsd: z.number().nonnegative(),
      /** Cached input ÷ input over the answer and rerank calls. */
      cacheReadShare: z.number().min(0).max(1),
      cacheWriteShare: z.number().min(0).max(1),
      p50LatencyMs: z.number().int().nonnegative(),
    }),
  ),
  /** U, R and O: measured cost per question for a first ask, an exact repeat, and caching off. */
  U: z.number().nonnegative(),
  R: z.number().nonnegative(),
  O: z.number().nonnegative(),
  /** The repeat share above which implicit caching is cheaper; null when repeats aren't cheaper than first asks. */
  breakEvenRepeatShare: z.number().nullable(),
  /** Set when the first pass already read from the cache (an earlier run within the TTL), which would understate U. */
  warning: z.string().nullable(),
});
export type CacheRun = z.infer<typeof CacheRun>;
