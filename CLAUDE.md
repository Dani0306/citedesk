@AGENTS.md

# CiteDesk — project context

A documentation assistant that answers only from a given corpus and cites the exact passage behind every sentence, plus a retrieval eval suite that proves it finds the right passages. Stack, commands, layout, conventions and boundaries are in `AGENTS.md`; this file is the owner's context, plan and log.

This is a learning project and a portfolio piece. The real audience is a hiring manager reading the ablation table, so the numbers matter more than the UI. PaperTrail (`~/dev/papertrail`) is the reference for conventions: same `model_calls` logging, dated pricing table, run files + `baseline.json` + gate, `prompts/` workflow, and README blocks generated from run files.

**Problem.** People ask the same questions about documentation again and again. Keyword search misses differently-worded questions, and generic chatbots invent answers nobody can check.
**Users.** Support/ops staff, new hires, students (if the corpus is university rules), developers (if it is product docs). **Buyers:** small companies with an unsearchable wiki, agencies wanting an "ask our docs" widget.

---

## Who I am

Daniel Colorado — full stack developer in Medellín (UTC−5). Software Engineering student at IUE, full-time Back Office Agent at Third Way Health. Native Spanish, C1 English. Portfolio: danielcolorado.dev · GitHub: Dani0306.

**Already fluent, don't explain:** TypeScript, React, Next.js, Tailwind, Node, Supabase (Postgres, auth, storage, RLS, Edge Functions, pg_cron), Vercel, Git, GitHub Actions, Vitest, Playwright, OpenAI API in production, Zod and structured output (from PaperTrail), Claude Code.

**Teach these as we build** (2–3 sentences on the decision and the rejected alternative, in the prompt file and briefly in chat):

1. Embeddings, and why dimension and model are a schema decision
2. pgvector, HNSW vs IVFFlat
3. Chunking strategy; metadata filters
4. Hybrid search and reciprocal rank fusion
5. Reranking (listwise, done by an LLM)
6. Citations: markers validated in code vs provider-managed citations
7. Retrieval metrics: recall@k, MRR, nDCG
8. Groundedness evals, LLM-as-judge, judge calibration
9. Prompt caching, with a measured cost drop
10. Streaming
11. Langfuse tracing
12. A little Python (analysis notebook only)

## Constraints

- **Time:** 24 h/week around a full-time job and university.
- **Budget:** this project $4–8/month; the whole roadmap under $20/month. Free tiers for hosting. Prices are in "Cost model" below.
- Everything else (stack, CiteDesk's own Supabase project, data-safety rule, secrets) is in `AGENTS.md`.

---

## Scope

**Minimum (ships):**

1. Ingest: loader → chunker → embeddings → `chunks` table with `embedding vector(1536)`, heading path, source URL, section anchor.
2. HNSW index and the `match_documents` SQL function.
3. Hybrid retrieval: vector + full-text merged with RRF.
4. Answer generation with inline citations linking to the source section anchor.
5. Streaming UI.
6. Honest refusal when the top retrieval score is below a threshold: "I don't know" plus the closest section.

**Stretch (only after deploy, except rerank, the playground and click-to-highlight, which the build guide in `AGENTS.md` schedules earlier):** rerank top-50 → top-8 (LLM rerank) · metadata filters (product/version/language) · query rewriting / multi-query · contextual retrieval · Spanish questions against English docs · click-a-citation-to-highlight · retrieval playground (chunks, scores before and after rerank, which were cited).

The demo needs click-to-highlight and the "I don't know" path. Click-to-highlight is the first stretch item to pull in right after deploy; the playground is week 5 per the schedule below.

## Definition of done

Not done until all five exist (the 90-second demo video was dropped by the owner on 6 Nov 2026; the live demo and the README carry the story):

1. Deployed URL with a demo mode (sample questions preloaded, no login)
2. Public GitHub repo
3. README with architecture diagram and the ablation table
4. Case study published on danielcolorado.dev
5. Eval suite green in CI with a committed baseline

Until it is deployed it stays in the "In the lab" section of the portfolio. Never describe it as finished before that.

**Status, 6 Nov 2026 (T48):**

| # | Criterion | State | Evidence / what is missing |
| - | --------- | ----- | -------------------------- |
| 1 | Deployed URL with a demo mode | **Met** (unlisted) | `https://citedesk-olive.vercel.app`: 7/7 live smoke checks, production traces and `query_log` rows confirmed. Caveat: the provisional 0.60 refusal threshold over-refuses paraphrases until T33 |
| 2 | Public GitHub repo | **Met** | Public since before this phase; MIT `LICENSE` added in the Phase 9 PR |
| 3 | README with architecture diagram and the ablation table | **Partly** | Diagram verified (Mermaid parses and renders). The ablation table renders "Pending": the set has 3 of 40 questions (T20) |
| 4 | Case study published on danielcolorado.dev | **Not done** | Draft in `docs/case-study.md`, numbers Pending; publishing is the owner's step |
| 5 | Eval suite green in CI with a committed baseline | **Partly** | CI green; the gate prints "no baseline yet" because `evals/baseline.json` needs T22 on the full set |

**Blocked on the owner's hand work, in order:** T20 (37 more questions) → T33 (10 unanswerable) → threshold sweep → T22 + ablation runs → T26 → baseline commit → T35 (rubric edits, 30 labels) → judge calibration → publish the case study and remove `noindex` (T46).

## Workflow

**Phase 0: Decisions**

- [x] T01 Choose the corpus (open decision 1), verify licence, pin the commit SHA, pick the 300–1000-chunk subset
- [x] T02 Choose the score that gates refusal (open decision 3)

**Phase 1: Database and cost plumbing**

- [x] T03 📝 Migration: schema `citedesk`, `vector` extension, six tables, RLS, grants (applied 5 Nov to `fscvgp…`; exposing the schema in the API settings is the owner's one dashboard step)
- [x] T04 `lib/db` server-only client + grant-failure smoke test (live `db:smoke` run waits on T03)
- [x] T05 `lib/cost` dated pricing table + cost maths
- [x] T06 Model-call wrapper writing `model_calls`

**Phase 2: Ingest**

- [x] T07 📝 Loader (`.mdx`, deterministic URLs and anchors; 997/997 anchors match the live site)
- [x] T08 Chunker (by heading, sub-sections merged up to 800 tokens, ~15% overlap when splitting)
- [x] T09 Embedder (batched, through the wrapper)
- [x] T10 `npm run ingest`, idempotent via hashes (835 chunks, $0.00423; a re-run plans 0 files)
- [x] T11 HNSW index + `match_documents` (ef_search measured)
- [ ] T12 ✋ Run ingest; sanity-check 10 questions by hand (ingest done; the 10 searches are the owner's, listed in prompt 004)

**Phase 3: Vector-only answers**

- [x] T13 Vector retrieval with per-query `ef_search` (set inside `match_documents`)
- [x] T14 📝 Answer prompt (static system prompt first, chunks after)
- [x] T15 Citation parser and validator
- [x] T16 Refusal rule (provisional threshold 0.60 until T33)
- [x] T17 `query_log` writes

**Phase 4: Retrieval eval baseline**

- [x] T18 📝 Eval Zod schemas, `chunk_key` labels, scorer
- [x] T19 Metrics: recall@5, recall@20, MRR, nDCG@10 (plus recall@8, what reaches the answer model)
- [ ] T20 ✋ Write and label the 40 questions (owner writes all 40, decided 6 Nov; tooling and 3 worked examples in `evals/questions.json`)
- [x] T21 `eval:retrieval` runner and run files
- [ ] T22 Run naive vector; record the baseline row (waits on T20)

**Phase 5: Hybrid, rerank, ablation**

- [x] T23 Full-text search (`fts` + GIN; lexemes ORed)
- [x] T24 RRF fusion (k 60); re-measure waits on T20
- [x] T25 LLM listwise rerank with fallback; re-measure waits on T20
- [ ] T26 Close open decisions 4, 5 and 6 from the table (waits on T20; runs and decision rule in prompt 007)
- [x] T27 `eval:report` renders the README ablation table (and the landing Evidence)

**Phase 6: Product surface**

- [x] T28 📝 `api/chat` route (sources first, streamed, validated)
- [x] T29 Chat UI with visible citations (`/demo`)
- [x] T30 Refusal UI
- [x] T31 Demo mode with sample questions (landing button stays disabled until T43, owner 6 Nov)
- [x] T32 Daily answer cap

**Phase 7: Generation evals**

- [ ] T33 ✋ 10 unanswerable questions; sweep the threshold (closes open decision 3) (`eval:threshold` built; waits on the owner's questions)
- [x] T34 `eval:generation` (built; the real run waits on T20 + T33)
- [ ] T35 ✋ Groundedness rubric + 30 hand labels (rubric drafted for the owner to edit, `eval:label` built)
- [ ] T36 Judge, calibrated to ≥85% agreement (open decision 8) (`eval:judge` built; calibration waits on T35)
- [x] T37 Diagnosis table (built; renders Pending until the runs qualify)

**Phase 8: Operations and gate**

- [x] T38 Prompt caching with a measured cost drop (break-even 31% repeats; demo keeps implicit)
- [x] T39 Langfuse tracing (one trace per question, confirmed live)
- [ ] T40 Commit `evals/baseline.json`; `eval:gate` and `eval:smoke` (gate and smoke built; the baseline waits on T22)
- [x] T41 GitHub Action (ask before adding the secret) (three secrets added 6 Nov, owner-approved)
- [x] T42 Retrieval playground (`/playground`)

**Phase 9: Deploy and ship**

- [x] T43 Vercel deploy + demo-mode smoke test (live 6 Nov, unlisted: `noindex`; smoke 7/7)
- [x] T44 Click-a-citation-to-highlight (closest wording by shared words; a weak match marks nothing)
- [x] T45 README: architecture diagram, ablation, diagnosis, judge calibration (diagrams verified; the evidence blocks render Pending until T20/T33/T35)
- [ ] T46 Case study on danielcolorado.dev (draft in `docs/case-study.md`; publishing and leaving "In the lab" are the owner's steps)
- [ ] T48 Check all five done-criteria (status below: 2 of 5 met)

T47 (the 90-second demo video) was dropped by the owner on 6 Nov 2026, so the numbering skips it.

After deploy (stretch): metadata filters · query rewriting / multi-query · Spanish questions against English docs · then the parked ideas.

---

## Evaluation — the portfolio centerpiece

Scoring rules (one tested place, label keys, baseline discipline) are in `AGENTS.md`. The plan:

**Retrieval suite** — 40 questions → expected chunks. recall@5, recall@20, MRR, nDCG@10, compared per configuration: naive vector, hybrid (RRF), hybrid + rerank (and + contextual retrieval if built).

**Ablation table** (README, generated from run files): config · recall@5 · MRR · cost per query · p95 latency. Add recall@20 and nDCG@10 columns if they fit.

**Generation suite**

- Groundedness: share of answer sentences supported by a cited chunk.
- Citation precision.
- Correct-refusal rate on out-of-scope questions (10 unanswerable questions).
- Hallucinated-citation count — must be 0. Checked in code, not by the judge.

**Judge calibration** — judge-vs-human agreement on 30 hand-labelled outputs, target ≥85%. Also report Cohen's kappa and the confusion matrix next to raw agreement, because 85% raw agreement can hide a judge that says "supported" almost always (my addition; drop it if you disagree). Write the rubric first, label before running the judge, iterate on the rubric, not on the labels. For scale, Kili's write-up of the TREC 2024 RAG Track reports 56% agreement between human and GPT-4o judges on support, and 72% once humans post-edited the LLM's judgement (secondary source; the paper, [arXiv 2504.15205](https://arxiv.org/abs/2504.15205), is not read). So the rubric's definition of "supported" will matter more than the judge model. LLM judges can favour earlier candidates (Deepchecks, [arXiv 2605.14488](https://arxiv.org/html/2605.14488v1)), so shuffle the evidence order when judging.

**Operational** — cost per answer, p50/p95 latency, prompt-cache hit ratio, tokens per answer.

**Diagnosis** — a README table crossing "retrieved the labelled section" with "answer grounded". A retrieval miss with a grounded-looking answer means the model leaned on what it already knows (a real risk with the Supabase corpus, see open decision 1); a hit with an ungrounded answer is a generation problem. Each failure is attributed to a stage.

**CI** — GitHub Action: full suite on PRs to `main`, a small smoke subset on every push. Fails if a headline metric drops more than 2 points below `evals/baseline.json`. Mirror PaperTrail's `eval-gate.yml`: skip (don't fail) when the API key secret is absent, pin actions by SHA, cap spend per run, upload the run file as an artifact. Ask before adding secrets to the repo.

**Runs** — files in `evals/runs/YYYY-MM-DD-*.json` record model IDs, config, prices-read date and cost; `npm run eval:report` renders README tables between markers and `--check` guards drift (as in PaperTrail).

---

## Working agreements

How to work (the prompt-and-approve loop, teaching rule, verifying against docs, ask-first list) is in `AGENTS.md` → 2 and 4. Beyond that:

- **Git:** small commits, conventional commit messages, a branch per task. Ask before pushing.
- **Scope slips:** if a week's scope won't fit the hours, say so in one or two sentences, then keep building under a stated assumption. Don't stop and wait unless the answer changes what gets built.
- Spanish is fine in conversation; code, comments, commits and docs in English.

---

## Decisions already made

- **Table is `chunks`, function is `match_documents`.** The brief says both "documents table" and `chunks`; the database section is more specific, so the table is `chunks`. The function keeps the name used in Supabase's docs so examples map one-to-one.
- **Labels use `chunk_key`, not database ids** (source path + anchor). Chunk size and overlap are open decision 2, and tuning them re-chunks everything, which would orphan id-based labels. Cost: labels are section-level, so a hit means "retrieved a chunk from the labelled section". Change this if you prefer exact chunk labels and are willing to relabel after each chunking change.
- **OpenAI is the only model provider** (owner has only an OpenAI key, 2 Nov). This replaces the original brief's Anthropic answers and Cohere reranking; the doc references in the brief that cover those were dropped.
- **Citations are markers.** Answers cite with `[n]` markers that code validates against the retrieved set. That keeps streaming simple and makes "hallucinated citations = 0" a deterministic check; provider-managed retrieval or citation features would hide the retrieval being measured.
- **Embedding model fixed:** `text-embedding-3-small`, 1536 dims, $0.02 per 1M tokens. Changing it is a migration (see `AGENTS.md`).
- **Answer model:** `gpt-6-luna`; optional escalation `gpt-6.1-sol`. IDs and prices verified on OpenAI's models and pricing pages, 2 Nov 2026. PaperTrail's measurement that luna matches sol was for extraction, not cited answers, so CiteDesk measures its own.
- **Demo mode is public and spends money**, so the answer route gets a global daily cap counted from `model_calls` (as PaperTrail's extraction cap), plus preloaded sample questions. Env: `CITEDESK_DAILY_ANSWER_CAP` (200 is a starting guess; confirm against measured cost per answer).
- **Rerank is optional at runtime.** If the rerank call errors, times out or returns invalid ids, the answer proceeds on fused order and the `query_log` row records `rerank: skipped`.
- **Positioning: the claim is evidence, not features.** Commercial tools such as kapa.ai already advertise citations and an explicit "I don't know"; none of the pages read for this publish retrieval ablations, and the closest open-source project found has no eval suite (see Prior art). The README compares only on what we measured; any competitor claim is linked, dated and marked vendor-claimed.
- **Metrics in TypeScript**, a Python notebook (pandas) only for analysis. FastAPI only if time remains, with a stated reason.

## Open decisions

Record the answer, the run that supports it, and the date when closed.

1. **Corpus. Decided 5 Nov 2026 (T01, owner): Supabase docs, `apps/docs/content/guides/database` + `guides/ai`, pinned at `supabase/supabase` commit `aa9d04e4f77447e2b6aaf317b686007aff05aa96` (master, 5 Nov).** 129 `.mdx` files (94 + 35). The rough estimate is ~380 chunks before heading splits and overlap, expected to land at 400–700; T12 measures the real count. Licence: the repo is Apache-2.0 (GitHub API), with no separate content licence or NOTICE in `apps/docs` and no root NOTICE. Excerpts are shown with attribution: "Source: Supabase docs (Apache-2.0), commit aa9d04e. Not affiliated with Supabase." URLs: `apps/docs/content/guides/<path>.mdx` maps to `https://supabase.com/docs/guides/<path>`; two samples were checked at HTTP 200. Full-text search uses `'english'`. Rejected: `auth` + `database` (closer to the chunk ceiling); IUE regulations (permission unverified, Spanish full-text). **Unanswerable topics** (outside the subset, but plausibly known by the model; T33 checks each against the ingested chunks before writing the questions): TOTP MFA in Supabase Auth · custom SMTP for auth emails · Storage upload size limits and resumable uploads · Edge Function cold starts · Realtime Broadcast rate limits · compute add-on prices · self-hosting env vars with Docker · branching previews with GitHub · creating an index in MongoDB · Firestore security rules.
2. **Chunk size and overlap.** **First ingest (5 Nov 2026, owner):** a section absorbs its own sub-sections while the total stays ≤ 800 tokens, never reaching a sibling; ~15% overlap when a section is split. Measured on the corpus: strict one-section chunks gave 1,161 chunks (median 112, min 5); the merge rule gives **835 chunks** (median 166, p90 623, max 800), inside T01's 300–1000. The 500-token floor is unreachable under any heading-respecting rule, because many top-level sections are short and have no children (713 of 835 are below 500). **Still open:** whether bigger chunks help recall. That's an ablation once the T20 labels exist. Switching re-embeds the corpus for ~$0.004, but labels are keyed to the chunk_keys of the rule in force, so decide before labelling grows.
3. **Refusal threshold.** **The gating score is decided (5 Nov 2026, T02, owner): the top vector-search chunk's cosine similarity, `1 − (embedding <=> query)`.** RRF scores are rank-based and not comparable across queries, and the rerank score disappears whenever rerank is skipped. **Still open: the threshold value,** swept in T33 against the 10 unanswerable questions. Reference only: Supabase's Next.js vector-search guide filters matches at similarity 0.78 (`match_count` 10, `min_content_length` 50), read from a search excerpt. Thresholds depend on the embedding model, so use it as a starting point for the sweep, not as a value. **First data point (5 Nov):** "How do I create a partial index?" ranked the right section first at 0.684 (next 0.481), so a 0.78 threshold would have refused a correct answer. **Provisional value 0.60 (5 Nov, prompt 005)**, from 10 probes: in-scope rank-1 0.664–0.721, out-of-corpus topics 0.341–0.501, "capital of France" 0.130. It applies while `CITEDESK_REFUSAL_THRESHOLD` is empty and is logged as `thresholdSource: "provisional"`. **Known leak:** `database/extensions/pg_cron` is a 17-token stub pointing at `guides/cron` (not ingested); "schedule a job every 5 minutes with pg_cron" scored 0.602, passed the gate, and the model answered from its own knowledge, citing an unrelated pg_net section. A valid marker on an unsupported claim: only the groundedness judge catches that. Use pg_cron as an unanswerable candidate in T33. **Second data point (6 Nov, prompt 007):** the in-scope paraphrase "How do I stop the auto-generated API from handing out every row of a new table?" retrieved both labelled sections at ranks 1–2 but its top similarity was 0.447, so the provisional 0.60 refused it. Paraphrases score lower than keyword-style questions; T33's sweep must include them. **Third data point (6 Nov, prompt 009 plumbing, 5 questions):** the worked-example paraphrases scored 0.447, 0.534 and 0.618 and two unanswerable questions 0.312 and 0.470, so 0.60 would falsely refuse 2 of 3 answerable questions and the sweep picked 0.48. Five questions decide nothing, but the provisional 0.60 is very likely too strict; T33 sets the value.
4. **Is reranking worth its latency and cost?** Decide from the ablation table: recall@5/MRR gain vs added p95 and cost per query (about +$0.003 by the estimate above).
5. **Contextual retrieval?** Decide after the baseline: it costs one extra model call per chunk at ingest.
6. **Reranker method.** Cohere Rerank was in the original plan but needs a key that isn't available, so reranking is an LLM call. Options: (a) listwise on `gpt-6-luna`, one call returning an ordered id list via structured output; (b) pointwise, one scored call per chunk (more calls, no position bias between candidates); (c) no rerank. A dedicated reranker can replace (a) later behind the same function. OpenAI offers no rerank endpoint: the AI SDK's `rerank()` supports only dedicated reranking models (Cohere, Bedrock), and `@ai-sdk/openai` has none (checked 6 Nov, prompt 007). **Recommendation:** (a) on top-50 → top-8, shuffle candidate order in evals, and let open decision 4 judge the result. **Built 6 Nov (T25): option (a)**, 50 candidates truncated to 300 tokens each, seeded shuffle in evals; first live call $0.00148, 3.4 s. Whether to keep it is open decision 4, from the table.
7. **CI cost control. Closed 6 Nov (prompt 010):** smoke on every push is retrieval-only (vector, ~10 questions, ≈ $0.000003); PRs to `main` that touch `lib/`, `evals/`, `scripts/eval*` or migrations run retrieval × 3 configs + generation on vector, each gated, with spend caps adding to $1 (≈ $0.09 a run). Skipped when a secret is missing. The gate needs `OPENAI_API_KEY`, `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (retrieval reads the database), all added. The judge stays offline: its labels belong to one labelled run.
8. **Judge model.** `gpt-6.1-sol` ($2/$10 per 1M) vs `gpt-6.1-terra` ($1/$5) vs `gpt-6-luna` ($0.10/$0.50). With one provider the judge shares a family with the generator, which can inflate groundedness (self-preference); say so in the README. **Recommendation:** judge with `gpt-6.1-sol`, a stronger model than the answerer, and report agreement for luna on the same 30 labelled outputs; that comparison is itself a teaching result. **Tooling built 6 Nov (prompt 009):** `eval:judge --model=gpt-6.1-sol|gpt-6-luna`; a one-sentence plumbing call on sol cost $0.0033 (1,099 input tokens, mostly the rubric, written to the cache), so 30 outputs ≈ $0.10–0.27 depending on answer length.
9. **Eval set size.** DataAIHub's retrieval-evaluation guide recommends a golden set of 50+ queries; the brief says 40. **Recommendation:** write 40 for the week-2 baseline and, if config-to-config gaps look within noise, grow to 50 before the first baseline is committed (changing the set later invalidates the baseline).

**Parked ideas** (seen in competitors, not in scope; none changes the plan): a coverage-gap report that groups refusals from `query_log` into a documentation backlog (kapa.ai) · multiple source groups / versions (kapa.ai) · code or PDFs as a source · Slack/Discord bot · retrieval API / MCP server. Revisit after deploy.

---

## Prior art

Gathered 2 Nov 2026 with Firecrawl (4 searches, 4 pages read). The scraped pages were summarised by the tool, not read in full; kapa.ai statements are vendor claims.

**Commercial "ask our docs" products** (your buyers' alternatives)

| Product        | What it advertises                                                                                                                                                                                                                                                                | Link                                                                                                                                                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| kapa.ai        | Citations on every answer, explicit "I don't know" guardrail, 50+ connectors (GitHub code, PDFs, Slack, Confluence, Zendesk), docs widget + Slack/Discord + API/MCP, coverage-gap analytics. Priced as a platform fee plus answer volume, 14-day trial; no public rate card found | [vs Inkeep](<https://www.kapa.ai/library/kapa.ai-vs-inkeep-(2026)-comparing-two-approaches-to-ai-for-technical-documentation>) · [vs Fin](<https://www.kapa.ai/library/kapa.ai-vs-fin-(formerly-intercom-fin)-which-ai-agent-fits-technical-products>) · [G2](https://www.g2.com/products/kapa-ai/reviews) |
| Inkeep         | Broader no-code agent builder with a TypeScript SDK                                                                                                                                                                                                                               | [inkeep.com](https://inkeep.com/)                                                                                                                                                                                                                                                                          |
| Algolia Ask AI | Conversational assistant on top of search; the Ask AI API is being replaced by Agent Studio                                                                                                                                                                                       | [Ask AI](https://www.algolia.com/products/ai/ask-ai) · [API](https://algolia.com/doc/guides/algolia-ai/askai/reference/api)                                                                                                                                                                                |
| Mintlify       | "Ask our docs" assistant on its own docs (Cmd/Ctrl+I)                                                                                                                                                                                                                             | [mintlify.com](https://www.mintlify.com/docs/contact-support)                                                                                                                                                                                                                                              |
| Oprag          | Drop-in cited chat widget; guide says show citations expanded by default on mobile, not in modals (thin page; says nothing on refusals)                                                                                                                                           | [guide](https://oprag.ai/guides/embed-cited-chat-widget/)                                                                                                                                                                                                                                                  |

**Open-source projects with the same shape**

- [sarmakska/rag-over-pdf](https://github.com/sarmakska/rag-over-pdf) (MIT): Next.js, `text-embedding-3-small`, in-memory vectors + BM25 fused with weighted RRF, LLM reranking with a lexical fallback, NDJSON stream with citations (filename, page, snippet) sent before the answer tokens. Tests use committed fixtures and need no key. No eval suite or published metrics. Borrowed: sources-first streaming, rerank fallback, key-free tests.
- [supabase-community/nextjs-openai-doc-search](https://github.com/supabase-community/nextjs-openai-doc-search) (Apache-2.0): chunks `.mdx` by section, 1536-dim embeddings in Postgres, a checksum per file so unchanged files aren't re-embedded, streamed completions; the page mentions no citations. Borrowed: the idempotent-ingest rule. Guide: [Vector search with Next.js and OpenAI](https://supabase.com/docs/guides/ai/examples/nextjs-vector-search).

**Evaluation references**

- [DataAIHub, retrieval evaluation](https://www.dataaihub.co/learn/retrieval-evaluation): 50+ query golden set; recall@k as the primary gate, MRR and nDCG for rank quality.
- [Kili, RAG evaluation guide](https://kili-technology.com/blog/rag-evaluation-guide-measuring-retrieval-and-generation-as-separate-problems): evaluate retrieval and generation separately; LLM judges are first-pass only, calibrated against humans.
- [aakashx, evaluating LLM/RAG/agent systems](https://www.aakashx.com/blog/evaluating-llm-rag-agent-systems/): retrieval-vs-generation failure matrix; citation correctness as its own check.
- [Deepchecks (arXiv)](https://arxiv.org/html/2605.14488v1) · [Weaviate, retrieval metrics](https://weaviate.io/blog/retrieval-evaluation-metrics) · [IBM RAG Cookbook](https://www.ibm.com/think/architectures/rag-cookbook/result-evaluation): metric definitions and judge limits.

## Cost model

Read from vendor pages on 2 Nov 2026; the OpenAI rows were re-read on 5 Nov (unchanged) when `lib/cost/pricing.ts` was written. The dated table in `lib/cost` is the source of truth once it exists; update this section from it.

| Item                                                | Price                                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `gpt-6-luna` (answers), per 1M, ≤272K input         | input $0.10 · cached input $0.01 · output $0.50                                                                                    |
| `gpt-6.1-sol` (escalation, judge candidate), per 1M | input $2.00 · cached input $0.10 · output $10.00                                                                                   |
| `gpt-6.1-terra` (judge candidate), per 1M           | input $1.00 · cached input $0.05 · output $5.00                                                                                    |
| Batch                                               | about half the standard rate (luna $0.05 / $0.25)                                                                                  |
| Prompts over 272K input tokens                      | higher long-context rates; irrelevant here (answers use ~6k)                                                                       |
| `text-embedding-3-small`, per 1M tokens             | $0.02 (standard)                                                                                                                   |
| Cache writes, per 1M (read 5 Nov)                   | luna $0.125 (30m) / $0.25 (12h) · sol $2.50 / $5.00 · terra $1.25 / $2.50. 1.25× and 2.5× input; this project uses the 30m default |
| Langfuse Cloud free (Hobby) tier (read 6 Nov)       | 50k units/month · 30 days of data access · 2 users; a demo answer is 2–3 observations                                              |

Back-of-envelope, from the prices above (estimates; replace with measured values): embedding 1,000 chunks of ~650 tokens ≈ 650k tokens ≈ $0.013. One answer on luna with ~6k input and ~400 output tokens ≈ $0.0008. An LLM rerank of 50 chunks sends ~32k input tokens ≈ $0.003 per query, about 4× the answer itself, so reranking is a real cost line in the ablation table. A judged answer on sol (~3k in, ~300 out) ≈ $0.009. A full eval run (40 reranked queries + 50 answers + 50 judgements) ≈ $0.6. Caching saves only on the stable prefix (the system prompt), because retrieved chunks change per query, so expect a modest drop unless the prefix is long; the week-5 measurement decides what the README says.

## Reference docs

Fetched 2 Nov 2026 unless noted. Moved: OpenAI docs now live at `developers.openai.com/api/docs/...`.

- Supabase AI — https://supabase.com/docs/guides/ai
- Vector columns — https://supabase.com/docs/guides/ai/vector-columns
- Semantic search — https://supabase.com/docs/guides/ai/semantic-search
- Hybrid search — https://supabase.com/docs/guides/ai/hybrid-search (example uses `rrf_k` 50, inner-product index, `'english'` fts)
- HNSW indexes — https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes
- pgvector on Supabase — https://supabase.com/docs/guides/database/extensions/pgvector
- pgvector — https://github.com/pgvector/pgvector (HNSW `m` 16, `ef_construction` 64, `ef_search` 40)
- OpenAI embeddings — https://developers.openai.com/api/docs/guides/embeddings
- OpenAI pricing — https://developers.openai.com/api/docs/pricing
- Chunking strategies — https://www.pinecone.io/learn/chunking-strategies/
- Contextual retrieval — https://www.anthropic.com/news/contextual-retrieval (the technique; we would run it on `gpt-6-luna`)
- OpenAI models — https://developers.openai.com/api/docs/models
- OpenAI prompt caching — https://developers.openai.com/api/docs/guides/prompt-caching
- AI SDK OpenAI provider — https://ai-sdk.dev/providers/ai-sdk-providers/openai (its docs also ship in `node_modules/@ai-sdk/openai/docs`)
- AI SDK chatbot UI — https://ai-sdk.dev/docs/ai-sdk-ui/chatbot
- AI SDK telemetry — https://ai-sdk.dev/docs/ai-sdk-core/telemetry
- Langfuse + AI SDK — https://langfuse.com/integrations/frameworks/vercel-ai-sdk (its Next.js section is the AI SDK v6 path; v7 differs, see `AGENTS.md`)
- promptfoo RAG evals (reference only) — https://www.promptfoo.dev/docs/guides/evaluate-rag/
- Eval fundamentals — https://hamel.dev/blog/posts/evals/

---

## Project log

Keep this current. Append one line per working session: date, what shipped, the numbers, what is next. It is the raw material for the case study.

- **2026-11-02** — `AGENTS.md` and `CLAUDE.md` written from the project brief after reading PaperTrail; prices, model IDs and limits checked against vendor docs (unverified items marked VERIFY). Next.js environment scaffolded (Next 16.4.4, exact-pinned AI SDK 7, Supabase, Zod, Vitest, tsx), `lib/models.ts` + 2 Vitest tests, `.env.example`. Typecheck, lint and tests pass. Nothing of the product built; $0 spent. Next: week 1, choose the corpus (verify its licence), then loader and chunker.

- **2026-11-02 (later)** — Only an OpenAI key is available, so the plan is OpenAI-only: answers `gpt-6-luna`, escalation `gpt-6.1-sol`, reranking by an LLM call instead of Cohere, and no native-citations option. `@ai-sdk/anthropic` removed, `lib/models.ts` and `.env.example` switched, `AGENTS.md` gotchas and this file's decisions, open decisions 4 and 6–8, cost model and reference docs rewritten after reading OpenAI's models, pricing and prompt-caching pages. Typecheck, lint, 2 tests pass; $0 spent. Next: week 1, choose the corpus (verify its licence), then loader and chunker.
- **2026-11-02 (research)** — Surveyed similar products and projects with Firecrawl (4 searches, 4 pages, about 28 credits) and recorded the findings: a Prior art section, a positioning decision, open decision 9 (eval set size), parked ideas, a diagnosis table in the eval plan, and judge-agreement context. `AGENTS.md` gained four rules (sources-first streaming, idempotent ingest, visible evidence in the UI, per-stage eval results). No code changed; $0 in model spend. Next: week 1, choose the corpus (verify its licence), then loader and chunker.
- **2026-11-03** — Step-by-step build guide (T01–T48, nine phases) added to `AGENTS.md`; the stretch rule in both files now names the three stretch items it schedules before deploy (rerank, playground, click-to-highlight). No code changed. Next: T01, choose the corpus (verify its licence), then T02.

- **2026-11-04** — `AGENTS.md` rewritten in a numbered-section structure (persona, how to work, UI, docs to lean on, app structure, stack, decisions, data, ingestion, retrieval and answers, evals, gotchas, checks, build guide, when in doubt) modelled on a reference file; nothing dropped. The workflow loop, teaching, verify and measure bullets moved out of this file's working agreements so nothing is said twice. No code changed. Next: T01, choose the corpus (verify its licence), then T02.
- **2026-11-04 (later)** — The T01–T48 task list is now mirrored in this file as the "Build order" checklist, so progress is ticked here and the details stay in `AGENTS.md` → 14. No code changed. Next: T01, choose the corpus (verify its licence), then T02.
- **2026-11-05** — Landing page built on `feat/landing-page` (prompt 001; not in the T01–T48 guide, owner request). `/` is now a static page:
  - hero, problem, a scripted citation demo (the only client island) and the honest-refusal state;
  - how it works, and Evidence showing only "Pending" (the build fails if a run file appears before T27 wires it);
  - audience, trust rules, FAQ and the call to action.

  Design tokens use one accent colour and support light, dark, high-contrast and reduced-transparency modes. Text uses the system font, with Geist Mono for evidence. No new dependencies. Typecheck, lint, 8 tests and build pass; $0. A visual pass in a browser is still owed (none in this session). Next: owner click-through at 360/768/1280, merge, then T01.

- **2026-11-05 (icon)** — Replaced the default Next.js favicon with the CiteDesk mark (the nav logo as a solid blue tile): `app/icon.svg` for tabs and `app/apple-icon.png` (180x180, rendered once with the `sharp` that ships with Next, no new dependency). `favicon.ico` removed. Trivial change, so no prompt file. Next: owner click-through of the landing page, then T01.
- **2026-11-05** — Landing page second pass (prompt 002): CSS scroll-driven reveals behind `@supports` and `prefers-reduced-motion` guards (content visible by default), a sticky three-step citation story with click override and three sample-question chips, a refusal gauge, a pipeline line, a chunk diagram, an inline-SVG icon set, back-to-top and a generated Open Graph image. No new dependency; $0 model spend. Checked in headless Chrome (stepping, click override, reduced motion, no-JS, 390/768/1280); Safari, Firefox, Lighthouse and the throttled Performance check are still manual. Layout shift over a full scroll 0.002. Next: T01, choose the corpus (verify its licence), then T02.
- **2026-11-05 (T01–T06)** — Phase 0 decided (prompt 003). T01: Supabase docs `database` + `ai` at `aa9d04e` (Apache-2.0, ~400–700 chunks estimated) plus 10 unanswerable topics. T02: refusal gated on the top chunk's vector similarity. The first pass pointed CiteDesk at the shared lab project (`zatpmd…`, PaperTrail's), but the owner then chose the new, empty project `fscvgp…` it was already configured for, so the config was reverted and the rule changed to "CiteDesk has its own Supabase project". Phase 1 built:
  - **T03:** migration with six `citedesk` tables, RLS and `service_role`-only grants (applying it waits on an MCP reload onto project `fscvgp…`);
  - **T04:** `lib/db` with `unwrap()` and `npm run db:smoke`;
  - **T05:** `lib/cost` priced 5 Nov, which closes the cache-write VERIFY;
  - **T06:** `lib/calls` with `recordCall`, JSONL and DB sinks, and cache writes recorded.

  `.env.example` recreated (it had never been committed). 40 tests; $0. Next: apply T03 and run `db:smoke`, then T07 (loader).

- **2026-11-05 (later)** — Hero image generated with Higgsfield (GPT Image 2.6, transparent WebP, chosen over Nano Banana Pro, Seedream, FLUX and others by cost and fit): 3 drafts + 1 final = 5.75 credits (≈$0.40). Shipped as a 104 KB decorative image beside the headline on large screens only. Next: T01, choose the corpus (verify its licence), then T02.
- **2026-11-05 (project)** — Owner decision: CiteDesk uses its **own Supabase project `fscvgp…`**, not the shared lab project that hosts PaperTrail (`zatpmd…`). `.env.local`, `.mcp.json` and `.env.example` point at `fscvgp…`; AGENTS.md and CLAUDE.md no longer say "shared lab project". The Supabase MCP in the running session still reports `zatpmd…` until Claude Code is restarted, so **T03 must not be applied until the MCP reports `fscvgp…`**. Next: restart, confirm with `get_project_url`, apply T03, expose `citedesk` in the API settings, run `db:smoke`.
- **2026-11-05 (T03 applied)** — Confirmed the session MCP reports `fscvgp…` (CiteDesk's own project; PaperTrail is `zatpmd…`) and that the database was empty, then applied the migration. Verified in the database: 6 tables, RLS on with 0 policies, `service_role` has read/write, `anon` and `authenticated` have no table or schema access, `embedding` is `vector(1536)`, `vector` 0.8.2 in the `extensions` schema, 11 indexes. Security advisor: only the expected INFO "RLS enabled, no policy" ×6, which is the design. `db:smoke` before exposure prints `PGRST106: Invalid schema: citedesk` for all six tables, not `0 rows`. Next: owner exposes `citedesk` in Settings → API → Exposed schemas, `db:smoke` shows six `0 rows`, then T07 (loader).
- **2026-11-05 (exposed)** — Owner exposed `citedesk` in the API settings; `db:smoke` shows six tables at 0 rows.
- **2026-11-06 (Phase 2, prompt 004)** — T07–T11 built and run:
  - **Corpus:** a sparse, shallow checkout of the pin (129 files and the partials, 2 s).
  - **Loader:** frontmatter, ESM, comments, JSX, partials and fences handled. Anchors are checked against the live site: 96.8% matched at first, then **100% (997 of 997)** after matching supabase.com's real rule (github-slugger, then underscores dropped, code beside punctuation padded, no ids for headings inside tabs).
  - **Chunking:** the owner chose to merge sub-sections, giving **835 chunks**.
  - **Ingest:** **$0.00423** for 211,482 tokens, which exactly matched our cl100k count. The re-run planned 0 files and spent $0. 9 `model_calls` rows match 9 JSONL lines.
  - **T11:** HNSW (cosine) + `match_documents`, `service_role` only. **`ef_search` measured: `LIMIT 50` returns 40 rows at the default, 50 when raised**, and `match_documents` raises it itself.
  - **First search:** "partial index" → the right section at rank 1, 0.684.

  Deps added: `gpt-tokenizer` 4.1.0, `github-slugger` 2.0.0. 64 tests. Project spend $0.0042. Next: T12 (the owner's 10 searches), then T13.

- **2026-11-05 (Phase 3, prompt 005)** — T13–T17 built and run live: `lib/retrieve/vector.ts` (`vectorSearch` over `match_documents`), `lib/answer` (static instructions then numbered sources then the question; `[n]` validator; refusal gate; `answerQuestion` with injected deps), `lib/db/query-log.ts` (buffered calls written with `query_id` after the row), additive migration (answer, refusal_reason, invalid_citations, uncited_sentences), `npm run ask`. **Provisional threshold 0.60** from 10 probes (in-scope 0.664–0.721, out-of-corpus 0.341–0.501). 6 live questions: 4 answered with **0 invalid markers** at $0.00023–$0.00043 and 2.8–3.9 s, 2 refused on `low_score` for the embedding alone (~$0.0000003). Findings: every answer call wrote ~the whole prompt to the cache at 1.25× (+~23% per answer, a T38 decision); the pg_cron page is a stub, so a pg_cron question passed the gate at 0.602 and got an answer from model memory with a valid-but-wrong citation. `reasoning: "low"` produced 0 reasoning tokens. 115 tests. Phase spend ≈ $0.0013; project ≈ $0.0055. Next: T12 (owner's 10 searches) if not done, then T18 (eval schemas and scorer).
- **2026-11-06** — Phase 3 closed out: prompt 005's acceptance criteria ticked after re-verifying `npm run search` on `vectorSearch` live; the three migration files renamed to the versions the database records (the MCP assigns its own timestamps), with the rule added to `AGENTS.md` §12. No code change, $0.000001. Next: merge PR #4, T12 (owner's 10 searches), then T18.
- **2026-11-06 (Phase 4, prompt 006)** — Retrieval eval tooling built: Zod schemas for questions and run files (`evals/schema.ts`), label normalisation and checks (`evals/labels.ts`; a merged sub-section's label is pointed at its parent's key, via a new `anchors` list on `groupSections`), recall@5/@8/@20, MRR and nDCG@10 with each section credited once (`evals/metrics.ts`, hand-computed tests), the `eval:retrieval` runner (spend cap, run file + `eval_runs` row), `eval:check` and `eval:keys`. Owner decided to write all 40 questions by hand (no AI drafts). Plumbing run on the 3 worked examples: estimate = actual = $0.00000122, `eval_runs` 1 (file not kept: not a baseline); the no-keyword paraphrase r02 missed at 20. 135 tests. Next: T20 (owner writes and labels 40, `eval:check` clean), then T22.
- **2026-11-06 (Phase 5, prompt 007)** — T23–T25 and T27 built; T24/T25 re-measures and T26 wait on T20 (3 of 40 questions). T23: weighted `fts` (headings A, body B) + GIN + `keyword_documents`, lexemes ORed because `websearch_to_tsquery` matched 0 of 835 chunks for sentence questions. T24: RRF (k 60) in TypeScript with per-arm ranks; the gate stays on the vector arm and runs before any rerank. T25: listwise luna rerank of 50 → 8, ids validated, fused-order fallback, seeded shuffle in evals; `recordCall` logs `invalid_output` with tokens. Live: hybrid + rerank answer $0.0018 and 8.0 s (rerank $0.00148, 3.4 s, 11,160 tokens cache-written); a paraphrase with both labelled sections at ranks 1–2 was refused at 0.447 < 0.60. Plumbing runs (3 questions, not results) for vector/hybrid/hybrid-rerank: rerank $0.0015/query, p95 4.4 s; files not kept, `eval_runs` 2–4. T27: `eval:report [--check]` renders the README table and `evals/evidence.json`, only from full-set runs; the landing Evidence reads it. 169 tests. Phase spend ≈ $0.0064. Next: T20 (owner), then T22 and the three ablation runs (≈ $0.08), then T26.
- **2026-11-06 (Phase 6, prompt 008)** — T28–T32 built. `answerQuestion` split into `prepareAnswer`/`finishAnswer` so the streamed route and the evals share one path; `streamAnswer` writes `source-url` + `data-passage` parts before the first token, `data-citations` (or `data-refusal`) last. `POST /api/chat`: Zod `{ question }` (single-turn), daily cap from `model_calls` (429), logging in `finally`. `/demo`: sample chips, a dependency-free Markdown subset renderer with `[n]` buttons that highlight and focus the source card, sources visible by default, a designed refusal card, Stop/retry, `aria-busy` and one announcement per answer. Live: curl showed all 8 sources before the first delta; in headless Chrome sources appeared 1.6 s before the answer text, `[1]` highlighted and focused card 1, TOTP showed the refusal card, 0 px overflow at 390/768 after two fixes (opaque input bar; `overflow-wrap:anywhere` for long identifiers in snippets). Cap 0 → 429 with no model call. Repeat sample questions hit the prompt cache: $0.00006 vs $0.00043. 184 tests. Phase spend ≈ $0.0012. Landing "Try the demo" stays disabled until the deploy (owner). Next: T20 (owner), then T22 + ablation runs and T26.
- **2026-11-06 (Phase 7, prompt 009)** — Generation-eval tooling built; every number waits on the owner (T20: 40 questions; T33: 10 unanswerable; T35: rubric edits + 30 labels). One sentence splitter shared by the uncited count, labels and judge. `eval:threshold` (balanced accuracy, ties broken low), `eval:generation` (per-question outcome, hallucinated citations in code, label-based citation precision, correct/false-refusal rates), `evals/rubric.md` drafted (supported / unsupported / no_claim, judged only against the cited passages), `eval:label` (interactive, sentence-hash keyed, resumable; a piped-input bug fixed), `eval:judge` (rubric as instructions, evidence shuffled per sentence, output validated, agreement + Cohen's κ + confusion matrix, tested by hand including the always-supported judge at 90% agreement and κ 0), diagnosis table (retrieval hit × grounded) in the README and the landing cards, shown only from full-set runs. Plumbing (5 questions, files deleted, `eval_runs` 5–6 kept with notes): sweep picked 0.48 and 0.60 would falsely refuse 2 of 3 paraphrases; generation 0 hallucinated citations, 2 false refusals, r02 answered from a missed retrieval; one sol judge call $0.0033. 210 tests. Phase spend ≈ $0.0035. Next: the owner's T20 + T33 questions, then threshold → generation → labels → judge.
- **2026-11-06 (Phase 8, prompt 010)** — T38, T39, T41, T42 done; T40's gate and smoke built, the baseline waits on T22. **T38:** `cacheMode` (implicit | off; off = explicit mode with no breakpoint, measured 0 writes) and `eval:cache`. Measured U/R/O per question: hybrid + rerank $0.00173 / $0.00075 / $0.00143, vector $0.00030 / $0.00012 / $0.00025; **implicit pays above 31% exact repeats** in both. With rerank on, a repeat's answer call misses (rerank order is non-deterministic, so the prompt changes); 1 in 4 repeats missed anyway. Decision: the demo keeps implicit (sample chips repeat); `query_log` measures the real repeat share after deploy. **T39:** Langfuse via `registerTelemetry`, 5 pinned deps (`@ai-sdk/otel` 1.0.161 to match `ai` 7.0.161), a parent `citedesk.*` span per question, confirmed live (one trace: embedding + generation); free tier 50k units/month. **T40:** `eval:baseline`, `eval:gate` (2.0 points pass, 2.1 fail, hash mismatch fails, any hallucinated citation fails), `eval:smoke`. **T41:** `ci.yml` (lint, typecheck, tests, build, `eval:report --check`) + `eval-gate.yml` (smoke on push, full suite on PRs to main, $1 cap, SHA-pinned, JSONL-only logging); `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` set as repo secrets (owner-approved). **T42:** `/playground` + `/api/playground`: every candidate's vector/keyword/fused/rerank rank, sent-as and cited, behind the answer cap plus `CITEDESK_DAILY_RERANK_CAP` (50); headless-Chrome check passed (citation click highlights and focuses its row, 0 px overflow at 390). 227 tests. Phase spend ≈ $0.022. Next: T20 (owner) → T22 + ablation → baseline in its own commit; then T43 deploy.
- **2026-11-06 (Phase 9, prompt 011)** — T43–T46 built; **deployed**: `https://citedesk-olive.vercel.app` (Vercel Hobby, project `citedesk`, 8 production-only env vars, GitHub connected, `noindex` until T46), live smoke 7/7 (answer sources-first + citations-last, honest refusal, 400s, absolute `og:image`). The first deploy exposed two traps: the global Vercel CLI (41.4.1) is too old (use `npx vercel@65.12.1`), and **production traces were missing** because Next bundles `instrumentation.ts` and the route separately, so the route's `after()` flushed an empty second processor; the tracing state now lives on `globalThis` and production traces arrive (`environment: production`). **T44:** clicking `[n]` expands the card to the full passage and marks the closest wording to the sentence you clicked (pure shared-word matcher, weak matches mark nothing, headless-Chrome checked at 390/1280). **T45:** README rewritten, two Mermaid diagrams verified in Chrome, generated cost block from the T38 runs (n = 4, stated), confusion matrix added to the diagnosis block, dated vendor-claimed prior art. **T46:** `docs/case-study.md` draft, numbers Pending. **T47 dropped** (owner), done-criteria now five, MIT license added (owner). Landing: the demo button is live, stale "not ingested" footer fixed, logging notice on `/demo` and `/playground`. 253 tests. Phase spend ≈ $0.004. Total logged model spend $0.036 over 161 calls. Next: the owner's T20/T33/T35, then T22 + ablation + baseline, then publish (T46).
