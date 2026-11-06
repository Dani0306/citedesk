// Helpers every eval runner shares: flags, the git SHA a run records, run-file naming, the
// eval_runs copy, and the question file (`--questions=` points a plumbing run at a scratch file).
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { combineSinks, dbSink, jsonlSink } from "../lib/calls/sinks";
import { db } from "../lib/db/client";
import { unwrap } from "../lib/db/result";
import { loadQuestions, QUESTIONS_FILE, validateQuestions } from "../evals/inputs";

export const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

export function gitSha(): string {
  const sha = execSync("git rev-parse --short=12 HEAD").toString().trim();
  return execSync("git status --porcelain").toString().trim() ? `${sha}-dirty` : sha;
}

export const RUNS_DIR = path.join(process.cwd(), "evals", "runs");

/** evals/runs/YYYY-MM-DD-<kind>[-<name>].json, numbered if that name is taken. */
export function runFile(kind: string, name: string | null, date: Date): string {
  mkdirSync(RUNS_DIR, { recursive: true });
  const base = `${date.toISOString().slice(0, 10)}-${kind}${name ? `-${name}` : ""}`;
  for (let n = 1; ; n++) {
    const file = path.join(RUNS_DIR, `${base}${n === 1 ? "" : `-${n}`}.json`);
    if (!existsSync(file)) return file;
  }
}

export function maxUsdArg(fallback: number): number {
  const maxUsd = Number(arg("max-usd") ?? String(fallback));
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new Error("--max-usd must be a positive number");
  return maxUsd;
}

/** The question file, refused unless every label is valid. */
export async function checkedQuestions() {
  const file = arg("questions") ?? QUESTIONS_FILE;
  const set = loadQuestions(file);
  const { problems } = await validateQuestions(set);
  if (problems.length) {
    for (const p of problems) console.error(`  ${p.id}: ${p.message}`);
    throw new Error(`${problems.length} label problem(s) in ${path.relative(process.cwd(), file)}; fix them (npm run eval:check) first`);
  }
  if (file !== QUESTIONS_FILE) console.log(`Questions from ${path.relative(process.cwd(), file)} (not the committed set).`);
  return set;
}

export async function insertEvalRun(row: { kind: "retrieval" | "generation" | "judge"; config: unknown; models: unknown; prices_read_on: string; cost_usd: number; results: unknown }): Promise<number> {
  return z.object({ id: z.number() }).parse(unwrap(await db().from("eval_runs").insert(row).select("id").single())).id;
}

/** JSONL always; the model_calls table too, unless CITEDESK_LOG_DB=0 (CI, so eval runs don't count toward the demo's daily cap). */
export function scriptSink() {
  return process.env.CITEDESK_LOG_DB === "0" ? jsonlSink() : combineSinks(jsonlSink(), dbSink(db()));
}

export function main(run: () => Promise<void>) {
  run().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
