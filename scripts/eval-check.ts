// npm run eval:check — validates evals/questions.json: schema, unique ids and questions, and every
// label against the chunk_keys in citedesk.chunks. Free (no model calls). Exits 1 on any problem.
import { loadQuestions, validateQuestions } from "../evals/inputs";
import { questionsHash } from "../evals/schema";

async function main() {
  const set = loadQuestions();
  const { problems, ownersKnown } = await validateQuestions(set);

  const answerable = set.questions.filter((q) => q.answerable);
  const tags = new Map<string, number>();
  for (const q of set.questions) for (const t of q.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  console.log(`${set.questions.length} questions: ${answerable.length} answerable, ${set.questions.length - answerable.length} unanswerable`);
  console.log(`Tags: ${[...tags].map(([t, n]) => `${t} ${n}`).join(" · ") || "none"}`);
  console.log(`Hash: ${questionsHash(set).slice(0, 12)}`);
  if (!ownersKnown) console.log("Corpus not checked out: merged sub-sections can't be traced to their parent (npm run corpus:fetch).");

  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log(`  ${p.id}: ${p.message}`);
    process.exit(1);
  }
  console.log("\nLabels OK.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
