import type { ThresholdRow } from "./schema";

// The refusal-threshold sweep (T33, closes open decision 3's value). The gate is the vector arm's
// top similarity (T02); a question is refused below the threshold. Correct refusals are unanswerable
// questions refused; false refusals are answerable ones refused. The pick maximises balanced
// accuracy and breaks ties low: refusing a question the docs answer costs a demo more trust than
// letting one more through to the model's own "I don't know" net.

export type Scored = { answerable: boolean; topSimilarity: number | null };

export function sweepThresholds(scores: Scored[], { from = 0.3, to = 0.8, step = 0.01 } = {}): ThresholdRow[] {
  const answerable = scores.filter((s) => s.answerable);
  const unanswerable = scores.filter((s) => !s.answerable);
  if (answerable.length === 0 || unanswerable.length === 0) throw new Error("The sweep needs both answerable and unanswerable questions");
  const refused = (s: Scored, t: number) => s.topSimilarity === null || s.topSimilarity < t;
  const rows: ThresholdRow[] = [];
  for (let i = 0; ; i++) {
    const threshold = Math.round((from + i * step) * 100) / 100;
    if (threshold > to + 1e-9) break;
    const correctRefusalRate = unanswerable.filter((s) => refused(s, threshold)).length / unanswerable.length;
    const falseRefusalRate = answerable.filter((s) => refused(s, threshold)).length / answerable.length;
    rows.push({ threshold, correctRefusalRate, falseRefusalRate, balancedAccuracy: (correctRefusalRate + (1 - falseRefusalRate)) / 2 });
  }
  return rows;
}

export function chooseThreshold(rows: ThresholdRow[]): ThresholdRow {
  if (rows.length === 0) throw new Error("Nothing to choose from");
  return rows.reduce((best, r) => (r.balancedAccuracy > best.balancedAccuracy + 1e-12 ? r : best));
}
