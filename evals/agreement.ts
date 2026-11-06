import { GROUNDEDNESS_LABELS, type GroundednessLabel } from "./schema";

// Judge calibration (T36). Raw agreement flatters a judge that always says "supported" when most
// sentences are supported; Cohen's kappa subtracts the agreement two raters would reach by chance
// from their own label frequencies, so that judge scores about 0. The confusion matrix shows which
// mistakes it makes. Human labels are the reference: rows are human, columns are judge.

export type Matrix = Record<GroundednessLabel, Record<GroundednessLabel, number>>;

export function emptyMatrix(): Matrix {
  const row = () => Object.fromEntries(GROUNDEDNESS_LABELS.map((l) => [l, 0])) as Record<GroundednessLabel, number>;
  return Object.fromEntries(GROUNDEDNESS_LABELS.map((l) => [l, row()])) as Matrix;
}

export function confusion(pairs: [human: GroundednessLabel, judge: GroundednessLabel][]): Matrix {
  const m = emptyMatrix();
  for (const [h, j] of pairs) m[h][j]++;
  return m;
}

export function agreementStats(matrix: Matrix): { sentences: number; agreement: number | null; kappa: number | null } {
  const n = GROUNDEDNESS_LABELS.reduce((sum, h) => sum + GROUNDEDNESS_LABELS.reduce((s, j) => s + matrix[h][j], 0), 0);
  if (n === 0) return { sentences: 0, agreement: null, kappa: null };
  const po = GROUNDEDNESS_LABELS.reduce((sum, l) => sum + matrix[l][l], 0) / n;
  const pe = GROUNDEDNESS_LABELS.reduce((sum, l) => {
    const human = GROUNDEDNESS_LABELS.reduce((s, j) => s + matrix[l][j], 0) / n;
    const judge = GROUNDEDNESS_LABELS.reduce((s, h) => s + matrix[h][l], 0) / n;
    return sum + human * judge;
  }, 0);
  // Both raters used one and the same label for everything: chance agreement is total, kappa is undefined.
  const kappa = pe === 1 ? null : (po - pe) / (1 - pe);
  return { sentences: n, agreement: po, kappa };
}
