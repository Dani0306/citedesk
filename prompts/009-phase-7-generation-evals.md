# 009 — Phase 7: generation evals (T33–T37)

**Status:** draft
**Branch:** `feat/generation-evals` (from `main` after PR #7)
**Week:** 4 (build guide Phase 7)

## Goal

CiteDesk can measure its answers, not just its retrieval:

- a **threshold sweep** that closes open decision 3 from labelled answerable and unanswerable questions (T33);
- **`eval:generation`**: hallucinated citations (must be 0), citation precision, correct- and false-refusal rates, and the inputs for groundedness (T34);
- a **groundedness rubric** and a labelling tool for your 30 hand labels (T35);
- an **LLM judge** calibrated against those labels, reported with agreement, Cohen's kappa and the confusion matrix (T36);
- a **diagnosis table** that attributes every failure to retrieval or generation (T37).

**Scope slip, stated up front.** Every number in this phase needs your hand work:

- T20: the 40 answerable questions (still 3 of 40);
- T33: the 10 unanswerable questions;
- T35: the rubric's final wording and 30 labelled outputs.

So I build and test all the tooling and prove it end to end on a plumbing set (the 3 worked examples plus 2 unanswerable questions in a scratch file, never committed). The real sweep, generation run, judge calibration and diagnosis run once your labels exist, on your go-ahead.

## Docs read

- **`CLAUDE.md` → Evaluation:**
  - groundedness = the share of answer sentences supported by a cited chunk;
  - citation precision, the correct-refusal rate on 10 unanswerable questions, and a hallucinated-citation count that must be 0, checked in code;
  - the judge reaches ≥ 85% agreement on 30 hand labels, reported with Cohen's kappa and the confusion matrix;
  - write the rubric first and label before running the judge; iterate on the rubric, never on the labels;
  - shuffle the evidence order;
  - the diagnosis table crosses "retrieved the labelled section" with "answer grounded".
- **`CLAUDE.md` → open decisions 3 and 8.** For 3, the gating score is decided (top vector similarity), the value is provisional at 0.60, and paraphrases score lower (0.447 refused a correct retrieval). For 8, the recommendation is to judge with `gpt-6.1-sol` and report luna's agreement on the same 30 labels.
- **TREC 2024 RAG Track (via Kili, secondary source):** 56% human–GPT-4o agreement on support, so the rubric's definition matters more than the judge model.
- **Deepchecks:** judges favour earlier candidates.
- **`node_modules/@ai-sdk/openai/docs`:** GPT-6.1 Sol doesn't support `reasoning: "none"`, so the judge uses `low`.
- **`lib/cost/pricing.ts` (read 5 Nov):** sol is $2 input, $2.50 cache write and $10 output per 1M.

## Code inspected

- **`lib/answer/citations.ts`:** the sentence splitting lives inside `countUncited`, which isn't exported. The labeller, the judge and the metric must all split sentences the same way.
- **`lib/answer/answer.ts`:** `answerQuestion` returns retrieval, citations and refusal for every question. `evals/retrieval.ts`, `configs.ts`, `schema.ts`, `report.ts`, `lib/evidence.ts`: the run-file pattern, the spend caps and `MIN_EVIDENCE_QUESTIONS`.
- **`supabase/…schema.sql`:** `eval_runs.kind in ('retrieval', 'generation', 'judge')`.
- **`app/_landing/evidence.tsx`:** the "Hallucinated citations" and "Judge agreement" cards show "—" today.

## Decisions and assumptions

- **One sentence splitter, `splitSentences(answer)` in `lib/answer/citations.ts`.**
  - It returns `{ index, text, markers }` for each prose sentence. Code blocks are dropped and inline code is kept verbatim.
  - `countUncited` is rebuilt on top of it, with the same behaviour, guarded by the existing tests.
  - A sentence is the unit of groundedness for humans, the judge and the metric alike.
- **T33: threshold sweep, `npm run eval:threshold` (`evals/threshold.ts`).**
  - It runs one query embedding per question over every question (answerable and unanswerable) and records the vector arm's top similarity.
  - It sweeps 0.30–0.80 in steps of 0.01, recording the correct-refusal rate (unanswerable questions refused), the false-refusal rate (answerable questions refused) and balanced accuracy.
  - **Decision rule:** pick the threshold with the highest balanced accuracy, and break ties to the lowest. Refusing a correct answer costs more trust in a demo than one extra honest "I don't know" from the model's own net.
  - The file `evals/runs/YYYY-MM-DD-threshold.json` reports each question's score, so the overlap is visible, and it gets no `eval_runs` row (the table's `kind` check doesn't include it, and a sweep isn't a model run).
  - You write the 10 unanswerable questions with `answerable: false` in `evals/questions.json`, from T01's topics. Avoid ones the corpus actually covers; `eval:keys` helps check.
- **T34: `npm run eval:generation -- [--config=vector|hybrid|hybrid-rerank]` (`evals/generation.ts`).**
  - It runs `answerQuestion` on every question with the given retrieval config (default: the app's default).
  - **Per question:**
    - refused, and why;
    - the answer;
    - its sentences with markers;
    - `invalid` markers (hallucinated citations);
    - the cited `chunk_key`s;
    - **citation precision**: cited sources whose `chunk_key` is labelled ÷ cited sources. This is a label-based proxy: a cited but unlabelled section isn't necessarily wrong;
    - `retrievedLabelled` (a labelled section was among the 8 sent to the model);
    - `citedLabelled`;
    - tokens, cost and latency.
  - **Run metrics:**
    - total hallucinated citations (target 0);
    - mean citation precision over answered answerable questions;
    - correct-refusal rate (unanswerable refused);
    - false-refusal rate (answerable refused);
    - cost per answer, p50/p95 latency, tokens per answer.
  - Spend cap: $0.10 by default. The estimate is about $0.0005 a question, or about $0.025 for 50, and more with rerank.
  - The run is written to `evals/runs/YYYY-MM-DD-generation-<config>.json` plus `eval_runs` (`kind 'generation'`).
- **T35: rubric and labelling (✋ yours).**
  - **`evals/rubric.md`**, a draft for you to edit (see the question in the approval panel). It has three labels per sentence:
    - `supported`: every factual claim in the sentence is stated in, or follows directly from, at least one passage it cites;
    - `unsupported`: any claim is missing from, or contradicted by, the cited passages, *or* the sentence makes a claim and cites nothing;
    - `no_claim`: no checkable claim, for example "Here's how:" or a restated question.
  - The judgement is against **the cited passages only**, not the other retrieved ones and not general knowledge. It comes with worked examples and edge cases: partial support, paraphrase, code blocks, numbers, and claims true in reality but absent from the passage.
  - **`npm run eval:label -- --run=<generation run file>`** is an interactive CLI. For each of the first 30 answered questions it shows each sentence with its cited passages and takes `s`, `u` or `n`, plus an optional note. It writes `evals/labels/groundedness.json` (committed).
  - Labels are keyed by run file, question id, sentence index and a hash of the sentence text. That makes them resumable, and a stale label is flagged, never reused.
  - **Labels are never shown the judge's opinion.** The tool doesn't call any model.
- **T36: judge, `npm run eval:judge -- --model=gpt-6.1-sol|gpt-6-luna` (`evals/judge.ts`, 🎓).**
  - **One call per answer.** The static rubric goes first as `instructions`. Then each sentence comes with **its own cited passages, in an order shuffled with a per-question seed**, followed by the question.
  - Structured output: `{ labels: [{ index, label, reason }] }`, validated so every index appears exactly once with a known label. Anything else is `invalid_output`, logged with its tokens and counted, never guessed.
  - It judges exactly the 30 human-labelled outputs.
  - **Agreement** = matching labels ÷ labelled sentences.
  - **Cohen's kappa** = (p_o − p_e) / (1 − p_e), with p_e from both raters' marginals, plus the 3×3 confusion matrix (`evals/agreement.ts`, tested against hand-computed tables).
  - Writes `evals/runs/YYYY-MM-DD-judge-<model>.json` plus `eval_runs` (`kind 'judge'`), including the rubric file's hash, so iterating the rubric shows up as a new hash.
  - **Below 85%: edit the rubric, re-run, and never edit the labels.** Open decision 8 is closed from the sol-vs-luna comparison.
  - Groundedness for the diagnosis is the judge's labels on judged outputs: an answer is grounded if none of its claim sentences is unsupported.
- **T37: diagnosis (`evals/diagnosis.ts`, rendered by `eval:report`).**
  - It takes the latest qualifying generation run plus the judge run on it.
  - For each answered answerable question it crosses `retrievedLabelled` (a labelled section among the 8 sent) with grounded or not:
    - **hit × grounded** = ok;
    - **hit × ungrounded** = generation problem;
    - **miss × grounded** = the model leaned on its own knowledge, the risk flagged for this corpus;
    - **miss × ungrounded** = retrieval problem.
  - Refusals are reported separately: false refusals of answerable questions, and correct refusals of unanswerable ones.
  - The README gets a `<!-- diagnosis:start/end -->` block.
  - **Landing:** `lib/evidence.ts` gains `generation` (hallucinated citations, correct-refusal rate) and `judge` (agreement, kappa). The two "—" cards fill in only from qualifying runs: 40 answerable plus 10 unanswerable for generation, and 30 labelled outputs for the judge.
  - The same evidence rule applies: plumbing runs never reach the README or the landing page.

## What this teaches

- **🎓 Groundedness and LLM-as-judge (T35–T36).** "Supported" has to be defined before anyone labels, because a judge can only be as consistent as its rubric. The TREC 2024 RAG Track saw 56% human–GPT-4o agreement on exactly this question. Labelling first, then iterating the rubric rather than the labels, keeps the human labels the ground truth instead of something tuned to match the judge.

  Rejected: letting the judge produce the reference labels. That measures the judge against itself.
- **🎓 Judge calibration with kappa (T36).** Raw agreement flatters a judge that always says "supported" when most sentences are supported: with 90% supported sentences, that judge scores 90% and has learned nothing. Cohen's kappa subtracts the agreement expected by chance from the raters' own label frequencies, so that judge scores about 0. The confusion matrix shows *which* mistakes it makes.
- **Code-checked versus judged.** Hallucinated citations (a marker pointing at no retrieved source) are counted in code and must be 0. Whether a *valid* citation actually supports its sentence is the judge's job; the pg_cron answer in prompt 005 is the example. The two numbers answer different questions and are never merged.

## Files to touch

- `lib/answer/citations.ts` + test — edit — `splitSentences`, with `countUncited` rebuilt on it.
- `evals/threshold.ts` + test, `scripts/eval-threshold.ts` — create.
- `evals/generation.ts` + test, `scripts/eval-generation.ts` — create.
- `evals/rubric.md` — create (a draft, if you choose that).
- `evals/labels.ts` → `evals/groundedness-labels.ts` + test, `scripts/eval-label.ts`, `evals/labels/groundedness.json` — create. The label store is separate from the question labels.
- `evals/agreement.ts` + test, `evals/judge.ts` + test, `scripts/eval-judge.ts` — create.
- `evals/diagnosis.ts` + test — create. `evals/report.ts`, `scripts/eval-report.ts`, `lib/evidence.ts`, `app/_landing/evidence.tsx` (+ tests) — edit.
- `evals/schema.ts` — edit — `GenerationRun`, `JudgeRun`, `ThresholdSweep`.
- `README.md`, `package.json`, `AGENTS.md`, `CLAUDE.md` — edit.

## Requirements

1. `splitSentences` is shared by `countUncited`, the labeller, the judge and the metric, and the existing citation tests still pass.
2. The sweep picks the threshold by the stated rule. Tested: a clean separation, an overlap, and a tie broken low.
3. `eval:generation` counts invalid markers per question and in total, computes citation precision only over answered answerable questions, and keeps refusals out of precision. It enforces the cap.
4. **Kappa and the confusion matrix are tested against tables computed by hand,** including the "always supported" judge, which reaches high agreement and κ ≈ 0.
5. **The judge's output is validated:** a missing, repeated or unknown index, or an unknown label, is `invalid_output`, logged with its tokens and excluded from agreement (and counted).
6. Labels and judge runs are keyed by sentence hash, so a changed sentence never inherits a label.
7. The diagnosis attributes each answered answerable question to exactly one cell. Plumbing runs never reach the README or the landing page.
8. `npm test` makes no network calls.

## Security and data safety

- Every input is public Supabase docs and questions you write. No Third Way Health or client data is involved.
- Judge and generation calls go through `recordCall` with `store: false`.
- The labelling CLI only reads run files and writes the label file. It makes no model call.

## Cost impact

- **The real runs, after your labels** (on your go-ahead):
  - the sweep, ≈ $0.00002;
  - a generation run over 50 questions, ≈ $0.025 (vector) to ≈ $0.10 (with rerank);
  - judging 30 outputs on sol, ≈ 3k in and 400 out each, ≈ $0.27;
  - the same 30 on luna, ≈ $0.01.
  - **≈ $0.35 for the phase.** That fits the monthly budget, but it's the biggest single line so far.
- **This task's plumbing runs** (5 questions: sweep, generation, one judge call on sol over a self-test label file I write and then delete): **≈ $0.02**, approved with this prompt.

## Acceptance criteria

- [ ] T33: the sweep is tooled and tested, and a plumbing run works. **The value waits on your 10 unanswerable questions and T20.**
- [ ] T34: `eval:generation` is tested, and a plumbing run writes a valid run file and an `eval_runs` row.
- [ ] T35: the rubric draft (or your text) is in place, and `eval:label` works on a plumbing run. **The 30 labels are yours.**
- [ ] T36: agreement and kappa are tested, and the judge's validation is tested. A plumbing judge call parses. **Calibration waits on your labels.**
- [ ] T37: the diagnosis is tested and the README block renders "Pending". The landing page builds with both cards still "—".

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run eval:report -- --check`
- Live: the plumbing runs listed above

## Manual test steps (your hand work, in order)

1. Finish T20: 40 answerable questions.
2. Add 10 unanswerable questions (`"answerable": false, "expected": []`) from T01's topics, then run `npm run eval:check`.
3. Run `npm run eval:threshold` and read the overlap. I then set `CITEDESK_REFUSAL_THRESHOLD`, and record the value in open decision 3.
4. Run `npm run eval:generation` (about $0.025), then `npm run eval:label -- --run=evals/runs/<that file>`, and label the 30 outputs using `evals/rubric.md`.
5. Tell me, and I'll run `npm run eval:judge -- --model=gpt-6.1-sol` and `-- --model=gpt-6-luna`, iterate the rubric if agreement is under 85%, and run `npm run eval:report`.

## Results

Filled in after the work.
