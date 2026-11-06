import { z } from "zod";

// The evidence summary: the only eval numbers the app ever shows. `npm run eval:report` writes it
// to evals/evidence.json from the run files; the landing page reads it at build time. It lives in
// lib/ because the app never imports evals/.

/** A run counts as evidence only on the full labelled set (the planned 40); smaller runs are plumbing. */
export const MIN_EVIDENCE_QUESTIONS = 40;

const points = z.number().min(0).max(1);

export const EvidenceRow = z.object({
  config: z.string().min(1),
  recallAt5: points,
  recallAt20: points,
  mrr: points,
  ndcgAt10: points,
  costPerQueryUsd: z.number().nonnegative(),
  p95LatencyMs: z.number().int().nonnegative(),
  runFile: z.string().min(1),
  runDate: z.iso.date(),
});
export type EvidenceRow = z.infer<typeof EvidenceRow>;

/** Generation evidence needs the 10 unanswerable questions too; judge evidence needs the 30 labelled outputs. */
export const MIN_UNANSWERABLE = 10;
export const MIN_JUDGED_OUTPUTS = 30;

export const GenerationEvidence = z.object({
  config: z.string().min(1),
  hallucinatedCitations: z.number().int().nonnegative(),
  citationPrecision: points.nullable(),
  correctRefusalRate: points.nullable(),
  falseRefusalRate: points.nullable(),
  runFile: z.string().min(1),
  runDate: z.iso.date(),
});

export const JudgeEvidence = z.object({
  model: z.string().min(1),
  agreement: points.nullable(),
  kappa: z.number().nullable(),
  sentences: z.number().int().nonnegative(),
  runFile: z.string().min(1),
  runDate: z.iso.date(),
});

export const EvidenceSummary = z.object({
  questionsHash: z.string().length(64),
  /** Answerable questions in the current set. */
  questionCount: z.number().int().nonnegative(),
  minQuestions: z.number().int().positive(),
  /** Empty until a run on the full current set exists. */
  rows: z.array(EvidenceRow),
  generation: GenerationEvidence.nullable().default(null),
  judge: JudgeEvidence.nullable().default(null),
});
export type EvidenceSummary = z.infer<typeof EvidenceSummary>;

export const CONFIG_LABELS: Record<string, string> = {
  vector: "Naive vector",
  hybrid: "Hybrid (vector + full-text, RRF)",
  "hybrid-rerank": "Hybrid + rerank",
};

/** Two significant digits without exponents: $0.00000041, $0.0015, $0.12. */
export function formatUsd(x: number): string {
  if (x === 0) return "$0";
  const decimals = Math.max(2, 1 - Math.floor(Math.log10(x)));
  return `$${x.toFixed(decimals)}`;
}

export const formatPoints = (x: number) => (x * 100).toFixed(1);
export const formatPercent = (x: number) => `${Math.round(x * 100)}%`;
export const formatMs = (ms: number) => `${ms.toLocaleString("en-US")} ms`;
