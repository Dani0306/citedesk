import "server-only";
import { startOfUtcDay } from "../answer/cap";
import { db } from "./client";
import { unwrapCount } from "./result";

/** Answer calls logged since 00:00 UTC, counted with the partial index on model_calls. */
export async function answersToday(now: Date = new Date()): Promise<number> {
  return unwrapCount(
    await db()
      .from("model_calls")
      .select("id", { count: "exact", head: true })
      .eq("purpose", "answer")
      .gte("created_at", startOfUtcDay(now).toISOString()),
  );
}
