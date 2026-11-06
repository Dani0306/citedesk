// npm run eval:gate -- --run=<retrieval or generation run file> — the 2-point regression gate (T40).
// Exits 1 on a regression. With no evals/baseline.json yet it reports that and exits 0: it never
// pretends to gate.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Baseline, gateGeneration, gateRetrieval, type Verdict } from "../evals/gate";
import { GenerationRun, RetrievalRun } from "../evals/schema";
import { arg, main } from "./eval-shared";

const BASELINE = path.join(process.cwd(), "evals", "baseline.json");

function printVerdict(label: string, v: Verdict) {
  console.log(`${v.pass ? "PASS" : "FAIL"} ${label}`);
  for (const c of v.checks) {
    const nums = c.baseline !== null && c.run !== null ? `  baseline ${(c.baseline * 100).toFixed(1)} → run ${(c.run * 100).toFixed(1)}` : "";
    console.log(`  ${c.pass ? "ok  " : "FAIL"} ${c.metric}${nums}${c.note ? `  (${c.note})` : ""}`);
  }
}

main(async () => {
  const file = arg("run");
  if (!file) throw new Error("Usage: npm run eval:gate -- --run=<run file>");
  if (!existsSync(BASELINE)) {
    console.log("No evals/baseline.json yet, so nothing to gate against. Create it with npm run eval:baseline once full-set runs exist.");
    return;
  }
  const baseline = Baseline.parse(JSON.parse(readFileSync(BASELINE, "utf8")));
  const json = JSON.parse(readFileSync(path.resolve(file), "utf8"));
  const v = json.kind === "generation" ? gateGeneration(GenerationRun.parse(json), baseline) : gateRetrieval(RetrievalRun.parse(json), baseline);
  printVerdict(path.basename(file), v);
  if (!v.pass) process.exit(1);
});
