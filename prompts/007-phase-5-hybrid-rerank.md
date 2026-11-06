# 007 — Phase 5: hybrid retrieval, rerank, ablation (T23–T27)

**Status:** done (T23, T24, T25, T27); the T24/T25 re-measures and T26 wait on T20
**Branch:** `feat/hybrid-rerank` (from `main` after PR #5)
**Week:** 3 (build guide Phase 5)

## Goal

CiteDesk gains the hybrid half of its retrieval:

- full-text search over a weighted `fts` column (T23);
- reciprocal rank fusion with vector search (T24);
- an optional LLM listwise rerank of the top 50 down to 8, with validated ids and a fallback (T25);
- `npm run eval:report`, which renders the README ablation table and the landing page's Evidence numbers from run files, with `--check` for drift (T27).

`eval:retrieval` gains the `hybrid` and `hybrid-rerank` configs, and `npm run ask` can use either.

**Scope slip, stated up front.** T20 isn't done: `evals/questions.json` holds only the 3 worked examples. So **the re-measurements in T24 and T25 and the decisions in T26 (open decisions 4, 5 and 6) wait for your 40 labelled questions.** I build and test everything, and prove each config end to end on the 3 examples. Those runs are plumbing checks: their numbers are not results and won't be committed or shown anywhere.

## Docs read

- **Supabase "Hybrid search" guide (MCP `search_docs`, 6 Nov):**
  - `fts tsvector generated always as (to_tsvector('english', content)) stored`, plus a GIN index;
  - a SQL `hybrid_search` with `websearch_to_tsquery`, `ts_rank_cd`, `rrf_k = 50`, each arm limited to `least(match_count, 30) * 2`, and a full outer join.
- **Measured on our chunks (6 Nov, read-only SQL):** `websearch_to_tsquery` ANDs every word. For the 3 worked examples, all natural sentences, it matched **0 of 835 chunks**. It matched 3, 6 and 24 chunks only for short keyword-style questions. ORing the same lexemes matched 197–596 chunks, which `ts_rank_cd` then orders.
- **Postgres catalogue (same session):** `to_tsvector(regconfig, text)` and `setweight` are immutable. **`array_to_string` is only stable, so a generated column can't call it directly.**
- **`node_modules/ai/docs/03-ai-sdk-core/31-reranking.mdx`:** `rerank()` exists, but only for dedicated reranking models (Cohere, Bedrock). The installed `@ai-sdk/openai` docs have no reranking model. **This closes the VERIFY in open decision 6: OpenAI offers no rerank endpoint through the SDK**, so reranking is an LLM call.
- **`node_modules/ai/docs/03-ai-sdk-core/10-generating-structured-data.mdx`:**
  - `generateText({ output: Output.object({ schema }) })` returns `output`, validated against the schema;
  - a failure throws `NoObjectGeneratedError`, which keeps `text`, `response`, `usage` and `cause`.
- **Reciprocal rank fusion:** each list contributes 1 / (k + rank). Cormack et al. (SIGIR 2009) use k = 60; Supabase's example uses 50. k is recorded in every run, so it can be ablated.

## Code inspected

- **`supabase/migrations/20261106022600_match_documents.sql`:** the pattern for the new function (plpgsql, `security invoker`, empty `search_path`, `operator(extensions.<=>)`, `service_role` only, a `match_count` guard).
- **`lib/retrieve/vector.ts`:** `RetrievedChunk` has `similarity` as a required field, and `vectorSearch` embeds then matches.
- **`lib/answer/answer.ts`:**
  - `config.retrieval` is the literal `"vector"`;
  - the gate reads `retrieved[0].similarity`;
  - `query_log.rerank_status` already allows `applied`, `skipped` and `off`.
- **`lib/calls/record.ts`:** `recordCall` marks a call `ok` as soon as the API returns. It has no way to log `invalid_output`, which the schema allows and rerank needs.
- **`evals/configs.ts`, `evals/retrieval.ts`, `evals/schema.ts`:** a config registry with `vector` only, and `RetrievalRun` with `config.catchall`.
- **`app/_landing/evidence-data.ts` and `evidence.tsx`:** the Evidence section deliberately **throws at build time if any run file exists**, until T27 wires it. Its table has three rows (naive vector, hybrid, hybrid + rerank) and the columns Recall@5, MRR, Cost / query and p95 latency.
- **`README.md`:** it has no ablation markers yet.

## Decisions and assumptions

- **T23 `fts` column (🎓): headings weighted above body text.**
  - `fts = setweight(to_tsvector('english', citedesk.heading_text(heading_path)), 'A') || setweight(to_tsvector('english', content), 'B')`, generated and stored, with a GIN index.
  - `heading_text(text[])` is a one-line `immutable` SQL wrapper around `array_to_string(…, ' ')`. That's safe for `text[]`, whose text output doesn't depend on settings.
  - Headings go in because the embedding already sees them (`embedText` = heading path + content) and full-text search should see them too. With weight A, `ts_rank_cd` ranks a heading hit above a body hit.
  - `'english'` matches the corpus.
  - The migration is additive: a new column on 835 rows (a quick table rewrite), a function, an index. Nothing is dropped or retyped.
- **Full-text query: OR the question's lexemes, then rank.**
  - `keyword_documents(query_text, query_embedding, match_count)` builds `string_agg(quote_literal(lexeme), ' | ')::tsquery` from `to_tsvector('english', query_text)`. A question made only of stopwords returns no rows.
  - It ranks by `ts_rank_cd(fts, q)` desc, then id, and returns the same columns as `match_documents`, **including the cosine similarity to the query embedding.** So every fused chunk carries a real similarity, `RetrievedChunk` stays unchanged, and the snippet and closest-section code keep working.
  - Rejected: Supabase's `websearch_to_tsquery`, measured above at 0 matches for natural questions. It suits search-box keywords, not sentences.
- **T24 RRF in TypeScript (`lib/retrieve/rrf.ts`), not SQL.**
  - Both arms run in parallel as two RPCs, top 50 each. They are fused with `1 / (60 + rank)` per arm, ties broken by vector rank, then renumbered.
  - Each fused chunk keeps `vectorRank` and `keywordRank`, so evals and `query_log` can say which arm found it.
  - Rejected: one SQL `hybrid_search` like Supabase's. It's one round trip, but the fusion can't be unit-tested in Vitest and the per-arm ranks are hidden.
- **The refusal gate stays on the vector arm's top similarity (T02)**, even when the fused rank 1 came from the keyword arm. Retrieval now returns `{ chunks, topVectorSimilarity, rerank }`, and the gate reads `topVectorSimilarity`.
- **T25 rerank (`lib/retrieve/rerank.ts`, 🎓): listwise on `gpt-6-luna`, open decision 6 option (a).**
  - **Input:** the top 50 fused candidates, each as `[c<n>] heading path`, then its content truncated to 300 tokens. That bounds input at about 16k tokens.
  - **Instructions:** static, sent first: return the ids of up to 8 passages that best help answer the question, best first, and leave out unhelpful ones.
  - **Output:** `Output.object({ ids: string[] })`.
  - **The output is untrusted.** Every id must be a candidate, and none may repeat. More than 8 ids are cut to 8; zero ids, an unknown id or a repeat is `invalid_output`. Any error, timeout (20 s) or invalid output falls back to fused order with `rerank: skipped`.
  - The reranked ids come first, then the rest in fused order, so recall@20 is still measurable.
  - **Evals shuffle the candidate order** with a seed derived from the question id, which is reproducible and guards against position bias. The app keeps fused order.
  - Settings: `reasoning: "low"`, `maxOutputTokens: 1000`, `store: false`.
- **`recordCall` gains an optional `check(result)`** that returns an error message. The call is then logged as `invalid_output` *with* its tokens, because the tokens were spent. The real rerank function also catches `NoObjectGeneratedError` and returns its `usage`, so a schema failure is still priced. This is a small additive change to the T06 wrapper. The existing 5th parameter (`now`) becomes an options object `{ now, check }`, and its 2 test call sites are updated.
- **`answerQuestion` config:** `retrieval: "vector" | "hybrid"`, `rerank: boolean`, `candidates: 50`, `rrfK: 60`.
  - **The default stays `vector`, no rerank, until T26's table decides.** Switching it is one line.
  - `npm run ask -- --retrieval=hybrid --rerank "…"` exercises the rest.
  - `query_log.rerank_status` is set, and `retrieved` gains `vectorRank` and `keywordRank`. A skipped rerank's reason lives in its `model_calls` row, linked by `query_id`.
- **Eval configs:**
  - `hybrid`: fused top 20;
  - `hybrid-rerank`: rerank top 50 → 8, then fused order to 20.
  - Each config states its own cost estimate and default cap: embeddings only, at most $0.05, for the first two; for rerank, an upper bound of about $0.003 per question and a $0.25 cap.
  - Per-question results gain `rerankStatus`, and the run gains `rerankSkipped`.
- **T27 report (`npm run eval:report [--check]`):**
  - It reads `evals/runs/*.json` (`ci-*` ignored) and keeps, for each config, the latest run whose `questionsHash` matches the current `questions.json`.
  - **A run counts as evidence only if it covers ≥ 40 answerable questions** (`MIN_EVIDENCE_QUESTIONS`, the planned set size). So a plumbing run can never reach the README or the landing page.
  - **README:** a table between `<!-- ablation:start -->` and `<!-- ablation:end -->` with config, recall@5, recall@20, MRR, nDCG@10, cost/query, p95 latency and the linked run file. The header line states n and the hash. With no qualifying run, it shows "Pending: the question set has N of 40 labelled questions."
  - **Landing:** `evals/evidence.json`, a summary whose Zod schema lives in `lib/evidence.ts`. The app may import `lib/` but never `evals/`. `loadEvidence` reads the summary and returns `pending` or `measured`. The table fills the measured cells and keeps "Pending" for configs not yet run.
  - The old guard is replaced by a narrower one: the build still fails if a qualifying run file exists but `evidence.json` is missing.
  - `--check` re-renders both outputs and exits 1 on drift, ready for CI (T41).
- **Teaching note: the reranker shares a model family with the answerer.** That's fine for ordering. Open decision 8's self-preference concern is about judging, not ranking.

## What this teaches

- **🎓 Full-text search and its query (T23).** A `tsvector` is the document's stemmed lexemes with positions and weights, and a GIN index maps each lexeme to its rows. The query side matters as much: an AND of every word finds nothing for a natural sentence (measured: 0 of 835), so we OR the lexemes and let `ts_rank_cd` reward chunks that cover more of them, and cover them in headings.
- **🎓 Reciprocal rank fusion (T24).** Vector similarity and `ts_rank_cd` are on different scales that can't be compared, so RRF ignores the scores and adds `1/(k + rank)` from each list. A chunk ranked well by both wins, and k = 60 damps the difference between ranks 1 and 2.

  Rejected: a weighted sum of normalised scores. It needs per-corpus tuning and breaks whenever one arm returns nothing.
- **🎓 Listwise LLM reranking (T25).** One call sees all 50 candidates and returns an order, so it can weigh passages against each other. Its risks are cost (about $0.0016 a query, against $0.0003 for the answer), latency, position bias (hence the shuffle in evals) and invented ids (hence the validation and fallback).

  Rejected: pointwise scoring, 50 calls per query with scores that aren't calibrated across calls. Open decision 4 decides from the table whether rerank pays for itself.

## Files to touch

- `supabase/migrations/<version>_fts_keyword_documents.sql` — create — `heading_text`, the `fts` column, the GIN index, `keyword_documents` and its grants. The file is named after the version `list_migrations` reports.
- `lib/retrieve/keyword.ts`, `rrf.ts`, `rerank.ts`, `hybrid.ts` + tests — create.
- `lib/retrieve/vector.ts` — edit — share the row schema with keyword.
- `lib/calls/record.ts` + test — edit — the `{ now, check }` options and `invalid_output` with tokens.
- `lib/answer/answer.ts` + test, `lib/db/query-log.ts` + test — edit — retrieval modes, the gate on `topVectorSimilarity`, rerank status.
- `scripts/ask.ts`, `scripts/search.ts` — edit — `--retrieval` and `--rerank` flags.
- `evals/configs.ts`, `evals/retrieval.ts`, `evals/schema.ts` + tests — edit — the new configs, estimates and rerank fields.
- `evals/report.ts` + test, `scripts/eval-report.ts`, `lib/evidence.ts` — create.
- `app/_landing/evidence-data.ts` + test, `evidence.tsx` — edit — wire them to the summary.
- `README.md` — edit — an Evidence section with the markers.
- `package.json`, `AGENTS.md`, `CLAUDE.md` — edit.

## Requirements

1. The migration applies cleanly. `fts` is populated for all 835 rows, and the GIN index is used. `keyword_documents` is `service_role` only, rejects a bad `match_count`, and returns nothing for an all-stopword question.
2. RRF is a pure, tested function:
   - an item in both lists beats one in only one;
   - ties are broken by vector rank;
   - ranks are renumbered;
   - per-arm ranks are kept;
   - an empty arm is handled.
3. Rerank validation is tested for each case: unknown id, repeat, zero ids, more than 8, thrown error, schema failure with usage. Each fails safe to fused order with `skipped`, and an `invalid_output` call is logged with its tokens.
4. The gate uses the vector arm's top similarity in every mode, and the existing refusal tests still pass.
5. `eval:retrieval --config=hybrid` and `--config=hybrid-rerank` run on the 3 examples, write valid run files, and stay under their caps. Those runs are plumbing: they are deleted, not committed.
6. `eval:report` writes "Pending: N of 40" while the set is short, and `--check` passes immediately after a write and fails after a manual edit. The landing page builds with and without `evidence.json`.
7. `npm test` makes no network calls, and the app imports nothing from `evals/`.

## Security and data safety

- Both new SQL functions are `security invoker` with an empty `search_path`, executable by `service_role` only, and the advisor is re-checked afterwards.
- Rerank output is treated as untrusted, per `AGENTS.md` §10. Passages go to OpenAI with `store: false`.
- No new keys or env vars, and nothing reaches the browser beyond the static Evidence numbers.

## Cost impact

- **Hybrid adds no model calls** (one embedding per query).
- **Rerank adds one luna call per query:** about 10–16k input tokens (cache-written at 1.25×, see `AGENTS.md` §12) plus about 100 output tokens. That's about $0.0013–$0.0021 a query, roughly 4–6× the answer itself.
- **This task's live runs:**
  - 3-question plumbing runs for `hybrid` and `hybrid-rerank` (≈ $0.007);
  - 2–3 `npm run ask` checks with hybrid and rerank (≈ $0.006).
  
  **The total is under $0.02**, and approving this prompt approves it. The full 40-question ablation after T20 is about $0.08, run only on your go-ahead.

## Acceptance criteria

- [ ] T23: the migration is applied and recorded, `fts` is populated, the GIN index exists, and `keyword_documents` passes requirement 1 live.
- [ ] T24: RRF is tested, and `hybrid` works in `eval:retrieval` and `npm run ask`. The re-measure waits on T20.
- [ ] T25: rerank and its fallbacks are tested, `hybrid-rerank` works live, and a forced failure (an invalid model id in a test) shows `skipped`. The re-measure waits on T20.
- [ ] T26: **waits on T20.** The prompt lists the exact runs and the decision rule.
- [ ] T27: `eval:report` and `--check` work, the README has the markers, and the landing page builds and shows "Pending".

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`, because the landing page and server modules change
- Live: the migration, advisors, plumbing runs, `ask`, and `eval:report --check`

## Manual test steps

1. `npm run ask -- --retrieval=hybrid "How do I stop the auto-generated API from handing out every row of a new table?"`. The sources list shows a `v`/`k` rank for each arm.
2. `npm run ask -- --retrieval=hybrid --rerank "When should I pick HNSW over IVFFlat?"`. You should see `rerank applied` and the rerank cost in the total.
3. `npm run eval:report`. The README section says "Pending: the question set has 3 of 40…", and `npm run eval:report -- --check` exits 0.
4. **After T20:** run `npm run eval:retrieval -- --config=vector`, then `--config=hybrid`, then `--config=hybrid-rerank` (about $0.08 in total), then `npm run eval:report`. **T26 decision rule:** keep rerank if it adds ≥ 3 points of recall@5 or MRR. If the gain is smaller, weigh it against the measured cost and p95 latency, and record the call in `CLAUDE.md`.

## Results

- **T23 (live, 6 Nov):**
  - The migration was applied as `20261106172830`, and `fts` is filled on all 835 chunks.
  - With `enable_seqscan` off, the planner uses `chunks_fts_idx` (a bitmap index scan).
  - `keyword_documents` returns 50 rows for r03, where the AND query returned 0, and 0 rows for an all-stopword question. Only `service_role` can execute it, and the advisor shows only the expected six INFO notices.
  - The keyword arm alone is noisy: r03's keyword top 5 was replication pages, pulled in by the common words "table" and "row". Fusion has to absorb that.
- **T24:** the hybrid search for r03 has both labelled sections at fused ranks 1–2 (v2/k12 and v1/k16).
- **T25:** `hybrid --rerank` on "When should I pick HNSW over IVFFlat?":
  - rerank applied, $0.00148 and 3.4 s;
  - 11,160 input tokens, almost all written to the cache, plus 164 output (136 of them reasoning);
  - the whole answer cost $0.0018 and took 8.0 s;
  - the reranker moved "HNSW vs IVFFlat", ranked 1 by both arms, down to 3rd.
- **The gate refused an in-scope paraphrase.** For r03 the top vector similarity was 0.447 against the provisional 0.60, so it was refused even though retrieval was right. This is recorded under open decision 3 for T33.
- **Plumbing runs, 3 questions, not results:**

  | Config | recall@5 | MRR | Cost/query | p95 |
  |---|---|---|---|---|
  | vector | 66.7 | 50.0 | $0.00000041 | 1.7 s |
  | hybrid | 50.0 | 45.8 | $0.00000041 | 1.6 s |
  | hybrid-rerank | 77.8 | 83.3 | $0.0015 | 4.4 s |

  The rerank estimate was $0.0077 against $0.0046 actual. 0 reranks were skipped. Recorded as `eval_runs` 2–4; the files were deleted.
- **T27:**
  - `eval:report` writes "Pending: … 3 of 40". `--check` passes after a write, fails after a hand edit inside the block, and ignores edits outside it.
  - The landing page builds in both states. With a fake summary, the prerendered HTML showed `Run 2026-11-12`, `72.5`, `61.2`, `$0.00000041` and `1,707 ms`.
- **Spend:** ≈ $0.0064.
- **Checks:** 169 tests pass; typecheck, lint and build are clean.
