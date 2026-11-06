import "server-only";
import { startOfUtcDay } from "../answer/cap";
import { db } from "./client";
import { unwrapCount } from "./result";

/** Calls of one purpose logged since 00:00 UTC (answers use the partial index on model_calls). */
export async function callsToday(purpose: "answer" | "rerank", now: Date = new Date()): Promise<number> {
  return unwrapCount(
    await db()
      .from("model_calls")
      .select("id", { count: "exact", head: true })
      .eq("purpose", purpose)
      .gte("created_at", startOfUtcDay(now).toISOString()),
  );
}

export const answersToday = (now: Date = new Date()) => callsToday("answer", now);
