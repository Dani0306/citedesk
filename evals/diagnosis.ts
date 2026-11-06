import type { GenerationRun, JudgeRun } from "./schema";

// The diagnosis table (T37): every answered answerable question lands in exactly one cell, so a
// failure is attributed to a stage. "Retrieved" means a labelled section was among the chunks sent
// to the answer model; "grounded" means the judge found no unsupported sentence in the answer.
// A miss that still looks grounded is the risk this corpus carries: the model answering from what
// it already knows about Supabase, with citations that don't carry the claim.

export const CELLS = ["hitGrounded", "hitUngrounded", "missGrounded", "missUngrounded"] as const;
export type Cell = (typeof CELLS)[number];

export const CELL_MEANING: Record<Cell, string> = {
  hitGrounded: "OK",
  hitUngrounded: "Generation problem",
  missGrounded: "Model knowledge, not the docs",
  missUngrounded: "Retrieval problem",
};

export type Diagnosis = {
  cells: Record<Cell, number>;
  /** Answered answerable questions the judge didn't see (outside the 30 labelled outputs, or invalid output). */
  unjudged: number;
  falseRefusals: number;
  correctRefusals: number;
  answeredUnanswerable: number;
  perQuestion: { id: string; cell: Cell | "unjudged" | "false_refusal" | "correct_refusal" | "answered_unanswerable" }[];
};

export function diagnose(gen: GenerationRun, judge: JudgeRun | null): Diagnosis {
  const verdicts = new Map<string, ("supported" | "unsupported" | "no_claim" | null)[]>();
  for (const s of judge?.sentences ?? []) verdicts.set(s.questionId, [...(verdicts.get(s.questionId) ?? []), s.judge]);

  const cells: Record<Cell, number> = { hitGrounded: 0, hitUngrounded: 0, missGrounded: 0, missUngrounded: 0 };
  const d: Diagnosis = { cells, unjudged: 0, falseRefusals: 0, correctRefusals: 0, answeredUnanswerable: 0, perQuestion: [] };
  for (const q of gen.perQuestion) {
    if (q.outcome === "false_refusal") {
      d.falseRefusals++;
      d.perQuestion.push({ id: q.id, cell: "false_refusal" });
      continue;
    }
    if (q.outcome === "correct_refusal") {
      d.correctRefusals++;
      d.perQuestion.push({ id: q.id, cell: "correct_refusal" });
      continue;
    }
    if (q.outcome === "answered_unanswerable") {
      d.answeredUnanswerable++;
      d.perQuestion.push({ id: q.id, cell: "answered_unanswerable" });
      continue;
    }
    const labels = verdicts.get(q.id);
    if (!labels || labels.some((l) => l === null)) {
      d.unjudged++;
      d.perQuestion.push({ id: q.id, cell: "unjudged" });
      continue;
    }
    const grounded = !labels.includes("unsupported");
    const cell: Cell = q.retrievedLabelled ? (grounded ? "hitGrounded" : "hitUngrounded") : grounded ? "missGrounded" : "missUngrounded";
    cells[cell]++;
    d.perQuestion.push({ id: q.id, cell });
  }
  return d;
}
