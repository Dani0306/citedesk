// The public demo's budget guard (T32): a global cap on answer calls per UTC day, counted from
// model_calls. Refusals make no answer call and don't count; failed calls do (the conservative
// choice). Not exact under concurrency at the boundary, which is fine for a demo cap.

export const DEFAULT_DAILY_ANSWER_CAP = 200;

export const CAP_MESSAGE = "Today's demo limit is used up. It resets at 00:00 UTC; the code and eval results are on GitHub meanwhile.";

export function dailyAnswerCap(env: Record<string, string | undefined> = process.env): number {
  const raw = env.CITEDESK_DAILY_ANSWER_CAP?.trim();
  if (!raw) return DEFAULT_DAILY_ANSWER_CAP;
  const cap = Number(raw);
  if (!Number.isInteger(cap) || cap < 0) throw new Error(`CITEDESK_DAILY_ANSWER_CAP must be a whole number ≥ 0, got "${raw}"`);
  return cap;
}

/** 00:00 UTC of the day `now` falls on. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function capReached(answersToday: number, cap: number): boolean {
  return answersToday >= cap;
}
