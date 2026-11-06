# 006 — Phase 4: retrieval eval baseline (T18–T22)

**Status:** draft
**Branch:** `feat/retrieval-eval` (from `main` after PR #4)
**Week:** 2 (build guide Phase 4)

## Goal

CiteDesk can measure its retrieval:

- a labelled question set lives in `evals/questions.json`, keyed by `chunk_key`;
- one tested scorer computes recall@5, recall@20, MRR and nDCG@10;
- `npm run eval:retrieval` runs a configuration over the set and writes a dated run file plus an `eval_runs` row;
- the first row of the ablation table, naive vector, is recorded from that file.

T20 (writing and labelling the 40 questions) is your hand work. I build the tooling for it, and T22 runs once the labels exist.

## Docs read

- **`CLAUDE.md` → Evaluation and open decision 9**, plus the DataAIHub and Weaviate pages already summarised there:
  - recall@k is the primary gate; MRR and nDCG measure rank quality;
  - the golden set should have 50+ queries, and the plan is 40 first.
- **`AGENTS.md` §11:**
  - scoring and normalisation live in one tested place in `evals/`;
  - per-question results record every stage;
  - run files go in `evals/runs/`;
  - every runner prints its cost and takes a spend cap;
  - the app never imports `evals/`.
- **`CLAUDE.md` decisions:** labels are section-level `chunk_key`s for the chunking rule in force. "A hit means retrieved a chunk from the labelled section."

## Code inspected

- **`supabase/migrations/20261105232830_citedesk_schema.sql`:**
  - `eval_questions(question, expected_chunk_keys text[], answerable)` has a check that answerable ⇔ labels non-empty.
  - `eval_runs(kind 'retrieval'|'generation'|'judge', config, models, prices_read_on, cost_usd, results)`.
- **`lib/retrieve/vector.ts`:** `vectorSearch(question, k, deps)` returns ranked `RetrievedChunk`s with `chunkKey`. Several chunks can share one key when a long section was split.
- **`lib/ingest/chunk.ts`:**
  - `groupSections` merges a section's sub-sections into the parent's chunk, so **a sub-section's own anchor may not exist as a `chunk_key`**. For example, `…/row-level-security#views-and-rls` exists, but some children live inside their parent's chunk.
  - Its return value (`head`, `body`) doesn't say which anchors a group absorbed.
- **`lib/cost/pricing.ts`:** `PRICING_READ_ON`. **`lib/calls/*`:** `recordCall`, `memorySink`, `jsonlSink`, `dbSink`.
- **`.gitignore`:** `/evals/runs/ci-*.json` is ignored, and other run files are committed.

## Decisions and assumptions

- **The question file is the source of truth: `evals/questions.json`**, committed, as `{ version, questions: [{ id, question, answerable, expected: chunk_key[], tags?, note? }] }`.
  - Answerable questions need ≥ 1 expected key; unanswerable ones need none. T33 adds the 10 unanswerable questions to the same file.
  - A SHA-256 of the file's questions goes into every run, so a baseline can tell when the set changed.
  - `eval_questions` is not written for now. A second copy would only drift; the runner reads the file. If you want the table filled, it's a small sync script later.
- **Label normalisation, in `evals/labels.ts`, the one place for it:** a label can be written as a `chunk_key` or pasted as a live URL (`https://supabase.com/docs/guides/<path>#<anchor>`). Both normalise to `<path>#<anchor>`: trimmed, prefix stripped, trailing slash dropped, and a bare page meaning its preamble chunk.
- **Labels must name a `chunk_key` that exists.** `npm run eval:check` validates the file:
  - schema;
  - unique ids;
  - duplicate questions;
  - every key present in `citedesk.chunks`.

  When a key is unknown because its section was merged into a parent, the check names the parent key to use instead. That uses a new `anchors` list on each `groupSections` group, which is additive: same chunks, same hash. The scorer never remaps silently; the file holds the real key.
- **Scoring rules (`evals/metrics.ts`, 🎓 T19):** binary relevance. A retrieved chunk is relevant if its `chunk_key` is one of the expected keys. Ranks are chunk positions, meaning what the answer model actually sees.
  - **recall@k:** distinct expected keys found in the top k ÷ number of expected keys.
  - **MRR:** 1 ÷ the rank of the first relevant chunk within the top 20, or 0 if there is none.
  - **nDCG@10:** gain 1 for the first chunk of each expected key, and 0 for repeats of a key already credited, so a split section can't score twice. Divided by the ideal DCG for min(|expected|, 10) keys.
  - **recall@8** is added as an extra column. It's what reaches the answer model (`k = 8` in prompt 005). The headline set stays recall@5, recall@20, MRR and nDCG@10, as planned.
  - Means are taken over answerable questions only. Run files store metrics as 0–1 and the report shows points (×100), the unit of the 2-point gate.
- **The runner, `npm run eval:retrieval -- --config=vector [--max-usd=0.05] [--note=…]`:**
  - It validates the questions (refusing to run on bad labels).
  - It estimates the embedding cost with the tokenizer and aborts above the cap. It also stops mid-run if the measured spend passes the cap.
  - It runs each answerable question sequentially, so latencies don't interfere, through a config registry (`evals/configs.ts`; `vector` = `vectorSearch` with k = 20). Phase 5 adds `hybrid` and `hybrid+rerank` there.
  - It logs every embedding call (JSONL + `model_calls`, `query_id` null).
  - It writes `evals/runs/YYYY-MM-DD-retrieval-<config>.json`, with a numeric suffix if that name exists. The file holds:
    - `kind`, `createdAt`, `gitSha`, `config`, `models`, `pricesReadOn`;
    - `questionsHash` and `questionCount`;
    - `costUsd`, `costPerQueryUsd`, latency p50/p95;
    - `metrics`;
    - `perQuestion`: expected keys, the top 20 (key, similarity, rank), first relevant rank, each metric, and `stage: { retrievedLabelled@5, @8, @20 }`, ready for the generation and judge stages to add theirs later.
  - The same content goes into `eval_runs`, and the runner prints a summary table plus the misses at 20.
  - The run file is Zod-validated before it's written.
- **`npm run eval:keys [path-prefix]`:** lists the chunk_keys under a page with each heading path, token count and the sub-headings merged into it. It helps labelling without showing what retrieval returns. **Deliberately, there is no "suggest labels from search results" helper.** Labelling from the system under test makes recall look better than it is.
- **T22 runs only once T20's labels exist and `eval:check` passes.** If the set is still under 40 when you want a number, I'll run it but the run file and log will say how many questions it covered. It won't be called the baseline until the set is final (open decision 9).
- **`evals/baseline.json` is not created here.** It is T40, in its own commit.

## What this teaches

- **🎓 Retrieval metrics (T19).** recall@k asks whether the right section reached the window at all, and it is the gate: an answer can't cite what retrieval never returned. MRR asks how high the first right section sits. nDCG@10 also rewards putting every right section near the top, which matters for questions that need two sections.

  The rejected alternatives:
  - **precision@k:** with one or two relevant sections per question, its ceiling at k = 5 is 0.2–0.4, so it says more about the label count than about retrieval;
  - **a plain "top-1 correct" rate:** it throws away everything below rank 1.
- **Labels are section keys, scored at chunk ranks.** Section keys keep the labels valid when chunk size changes. Chunk ranks keep the metric honest about what the model sees. Crediting each key once stops a long split section from inflating nDCG.

## Files to touch

- `evals/schema.ts` — create — `QuestionSet`, `RetrievalRun`, per-question result schemas (Zod), `questionsHash`.
- `evals/labels.ts` + test — create — `normaliseLabel`, `checkLabels(set, knownKeys, owners)`.
- `evals/metrics.ts` + test — create — `recallAt`, `reciprocalRank`, `ndcgAt`, `scoreQuestion`, `aggregate`.
- `evals/configs.ts` — create — the retrieval config registry (`vector`).
- `evals/questions.json` — create — `version: 1` with 3 worked examples, labelled and checked, for you to keep or replace.
- `lib/ingest/chunk.ts` (+ test) — edit — `anchors` on each group (additive).
- `scripts/eval-retrieval.ts`, `scripts/eval-check.ts`, `scripts/eval-keys.ts`, `package.json` — create / edit.
- `AGENTS.md` §11/§13, `CLAUDE.md` (checklist, log) — edit.

## Requirements

1. Metrics are pure functions with hand-computed tests:
   - a perfect ranking;
   - a miss;
   - a relevant key at rank 3;
   - two expected keys at ranks 1 and 4;
   - a split section repeated at ranks 1–2, credited once;
   - an empty expected list, which is rejected for answerable questions.
2. `normaliseLabel` turns a URL or a key into the same key. `checkLabels` reports unknown keys, and names the parent for a merged sub-section anchor.
3. `eval:check` exits non-zero on any problem and lists all of them, not only the first.
4. The runner refuses invalid labels, prints the estimate, honours `--max-usd`, logs every call, and writes a run file that parses with `RetrievalRun` plus the matching `eval_runs` row.
5. `npm test` makes no network calls, and the app never imports `evals/`.

## Security and data safety

- The questions and labels are about public Supabase docs, written by the owner. No Third Way Health or client data is involved.
- The runner uses the existing server-only client and keys from `.env.local`. Nothing touches the browser.

## Cost impact

- **One retrieval run:** one embedding per answerable question, about 15 tokens each. 40 questions ≈ 600 tokens ≈ **$0.000012**.
- **This task's live runs:** an `eval:check` (free) and one run on the 3 worked examples to prove the plumbing (≈ $0.000001). T22, the 40-question run, is ≈ $0.00001. Approving this prompt approves those runs.

## Acceptance criteria

- [ ] T18: the schemas, normalisation and label check are tested; `eval:check` passes on the worked examples and fails clearly on a broken key.
- [ ] T19: the metrics are tested against hand-computed values.
- [ ] T20 (prepared): `eval:keys`, the guidelines below and 3 worked examples are in place. **You write and label the rest.**
- [ ] T21: `eval:retrieval --config=vector` writes a valid run file and an `eval_runs` row, prints the cost, and stops at the cap.
- [ ] T22: once the labels are final, the naive-vector run is committed and its numbers are recorded in `CLAUDE.md`.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`, because `lib/ingest` changes
- Live: `eval:check` and `eval:retrieval` on the worked examples

## Manual test steps (T20, your hand work)

1. Read a docs page, then write a question the way a user would ask it: **in your own words, not the heading's**. "Make an index that skips deleted rows" is a good question for the "Partial indexes" section; "How do partial indexes work?" is too easy.
2. Run `npm run eval:keys database/postgres/indexes` to list that page's keys, and pick the section or sections that answer it. You can also paste the live URL with its `#anchor`.
3. Aim for this mix:
   - about 25 `database` and 15 `ai` questions;
   - about 8 that need two sections (tag them `multi`);
   - about 8 phrased with no shared keywords (tag them `paraphrase`);
   - a few about code or SQL (tag them `code`).
4. Avoid the pg_cron stub (`database/extensions/pg_cron`). It has no content.
5. Run `npm run eval:check` until it's clean, then tell me, and I'll run T22.

## Results

Filled in after the work.
