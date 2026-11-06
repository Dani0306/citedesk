// The public demo's budget guard (T32): a global cap on answer calls per UTC day, counted from
// model_calls. Refusals make no answer call and don't count; failed calls do (the conservative
// choice). Not exact under concurrency at the boundary, which is fine for a demo cap.

export const DEFAULT_DAILY_ANSWER_CAP = 200;
/** Reranks cost ~5× an answer, so the playground's rerank toggle has its own, smaller cap (~$0.08/day worst case). */
export const DEFAULT_DAILY_RERANK_CAP = 50;

export const CAP_MESSAGE = "Today's demo limit is used up. It resets at 00:00 UTC; the code and eval results are on GitHub meanwhile.";

function readCap(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const cap = Number(raw);
  if (!Number.isInteger(cap) || cap < 0) throw new Error(`${name} must be a whole number ≥ 0, got "${raw}"`);
  return cap;
}

export const dailyAnswerCap = (env: Record<string, string | undefined> = process.env) => readCap(env, "CITEDESK_DAILY_ANSWER_CAP", DEFAULT_DAILY_ANSWER_CAP);
export const dailyRerankCap = (env: Record<string, string | undefined> = process.env) => readCap(env, "CITEDESK_DAILY_RERANK_CAP", DEFAULT_DAILY_RERANK_CAP);

/** 00:00 UTC of the day `now` falls on. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function capReached(answersToday: number, cap: number): boolean {
  return answersToday >= cap;
}
