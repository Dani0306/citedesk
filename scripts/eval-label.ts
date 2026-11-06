// npm run eval:label -- --run=evals/runs/<generation run>.json — the human groundedness labels (T35).
// Shows each sentence of the first 30 answered outputs with only the passages it cites, and records
// s / u / n against evals/rubric.md. Resumable; saves after every label. Calls no model, and never
// shows a judge's opinion: the labels are the reference the judge is measured against.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { pendingLabels, textHash } from "../evals/groundedness-labels";
import { GenerationRun, GroundednessLabelFile, type GroundednessLabel } from "../evals/schema";
import { arg, main } from "./eval-shared";

const LABELS_FILE = path.join(process.cwd(), "evals", "labels", "groundedness.json");
const KEYS: Record<string, GroundednessLabel> = { s: "supported", u: "unsupported", n: "no_claim" };

main(async () => {
  const runArg = arg("run");
  if (!runArg) throw new Error("Usage: npm run eval:label -- --run=evals/runs/<generation run>.json");
  const runFile = path.basename(runArg);
  const run = GenerationRun.parse(JSON.parse(readFileSync(path.resolve(runArg), "utf8")));

  const file: GroundednessLabelFile = existsSync(LABELS_FILE)
    ? GroundednessLabelFile.parse(JSON.parse(readFileSync(LABELS_FILE, "utf8")))
    : { version: 1, generationRun: runFile, labels: [] };
  if (file.generationRun !== runFile) {
    throw new Error(`evals/labels/groundedness.json labels ${file.generationRun}. Label that run, or move the file aside to start over.`);
  }
  const save = () => {
    mkdirSync(path.dirname(LABELS_FILE), { recursive: true });
    writeFileSync(LABELS_FILE, `${JSON.stringify(file, null, 2)}\n`);
  };

  const queue = pendingLabels(run, file);
  console.log(`${file.labels.length} labelled, ${queue.length} to go. Keys: s = supported, u = unsupported, n = no claim, q = quit. Add a note after a space.`);
  console.log("Judge each sentence only against the passages shown under it (evals/rubric.md).\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let lastQuestion = "";
  for (const item of queue) {
    if (item.question.id !== lastQuestion) {
      lastQuestion = item.question.id;
      console.log(`\n════ ${item.question.id} · ${item.question.question}\n`);
    }
    console.log(`── Sentence ${item.sentence.index}: ${item.sentence.text}`);
    if (item.evidence.length === 0) console.log("   (cites nothing)");
    for (const src of item.evidence) console.log(`\n   [${src.n}] ${src.headingPath.join(" › ")}\n${src.content.replace(/^/gm, "   │ ")}`);
    for (;;) {
      const reply = (await rl.question("\nLabel (s/u/n, q to quit): ")).trim();
      if (reply === "q") {
        rl.close();
        console.log(`Saved ${file.labels.length} labels.`);
        return;
      }
      const [key, ...note] = reply.split(" ");
      const label = KEYS[key];
      if (!label) continue;
      file.labels.push({ questionId: item.question.id, index: item.sentence.index, textHash: textHash(item.sentence.text), label, ...(note.length ? { note: note.join(" ") } : {}) });
      save();
      break;
    }
  }
  rl.close();
  console.log(`\nDone: ${file.labels.length} labels in ${path.relative(process.cwd(), LABELS_FILE)}.`);
});
