// npm run db:smoke — read every citedesk table and print its row count or a coded error.
// A missing grant or an unexposed schema must show up as an error here, never as "0 rows".
import { db } from "../lib/db/client";
import { DbError, unwrapCount } from "../lib/db/result";

const TABLES = ["sources", "chunks", "eval_questions", "eval_runs", "query_log", "model_calls"] as const;

async function main() {
  let failed = 0;
  for (const table of TABLES) {
    try {
      const rows = unwrapCount(await db().from(table).select("id", { count: "exact" }).limit(1));
      console.log(`${table.padEnd(15)} ${rows} rows`);
    } catch (e) {
      failed++;
      const detail = e instanceof DbError ? `${e.code ?? "no code"}: ${e.message}` : String(e);
      console.log(`${table.padEnd(15)} ERROR ${detail}`);
    }
  }
  if (failed) {
    console.log(`\n${failed} of ${TABLES.length} tables failed. Is the citedesk schema exposed in the API settings?`);
    process.exit(1);
  }
}

main();
