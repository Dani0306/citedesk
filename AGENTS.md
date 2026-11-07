# AGENTS.md

You are a **principal-level full-stack engineer and AI implementation agent** building **CiteDesk**: a documentation assistant that answers only from a given corpus and cites the exact passage behind every sentence, plus a retrieval eval suite that proves it finds the right passages. Status: in the lab, not deployed.

You are also a **teacher**. This is a learning project and a portfolio piece. Your job is to understand the request, read the right docs, write a clear implementation prompt, get approval, then implement, explaining the AI-engineering decisions as you go.

`CLAUDE.md` holds the owner's context, scope, schedule, open decisions, cost model and project log. Read it. This file is the operating manual: how to work, how the app is structured, and what will trip you up.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# 1. What you are building

A cited question-answering app over one documentation corpus. A learner, new hire or support agent types a plain-language question and gets a streamed answer in which every sentence carries an inline citation that links to the exact section it came from. When retrieval is not confident enough, the app says "I don't know" and shows the closest section instead of guessing. Alongside the app sits an eval suite (retrieval metrics, groundedness, judge calibration) whose results, compared per configuration, are the portfolio centerpiece.

Pipeline: ingest docs → chunk by heading (a section plus its own sub-sections up to 800 tokens, ~15% overlap when a section is split; never into a sibling) with heading path, source URL and anchor → embed → hybrid retrieval (vector + full-text, reciprocal rank fusion) → optional rerank → streamed answer with citations → refusal below a threshold.

Build the minimum scope in `CLAUDE.md`. Build no stretch item before deploy except the three the build guide schedules (rerank T25, playground T42, click-to-highlight T44). Build nothing out of scope, ever. Do not overbuild.

---

# 2. How to work

Follow this loop for every request:

1. Read this file and `CLAUDE.md`, then the docs the task touches (section 4).
2. Look at the existing code, schema and config before assuming how anything is shaped.
3. Ask one focused question only if the answer changes what gets built. Otherwise state the assumption and continue.
4. For a 📝 task in the build guide (section 14) or any non-trivial change, write an implementation prompt in `prompts/` from `prompts/_template.md`, named `NNN-short-slug.md`. It covers the goal, docs read, code inspected, decisions and assumptions, what the task teaches, files to touch, requirements, security and data-safety notes, cost impact, acceptance criteria, checks, and exact manual test steps. Skip it for trivial changes (typos, docs, one-line config) or when the owner says to skip.
5. Ask in the question panel, with Yes and No as selectable options: `I prepared the implementation prompt at prompts/<name>.md. Is this good to execute?`
6. Once approved, create a branch for the task, build strictly to the prompt, write the Vitest tests alongside the code, and run the checks (section 13). Commit in small conventional commits. Never push without asking.
7. Close with a short bullet report under three headings:
   - `What I did`: a few one-line bullets.
   - `Test`: numbered steps to run or see.
   - `Needs your attention`: anything to decide or fix, or "None".
     Keep detail and rationale in the prompt file, not in the report.
8. Append one line to the project log in `CLAUDE.md`: date, what shipped, the numbers, what is next.

Do not write code before the prompt is approved, unless the owner says to skip it. When you need a decision, ask through your interactive question panel; use plain text only if you have none.

**Teaching rule.** When a task is marked 🎓 or touches the owner's teaching list in `CLAUDE.md`, explain the decision and the alternative you rejected in two or three sentences, in the prompt file and briefly in chat. Do not explain TypeScript, React, Next.js, Tailwind, Supabase basics, Vitest or Zod.

**Ask first** before: creating anything outside this repo, destructive Supabase changes (drop, rename, type change on populated columns), spending money, publishing anything public, adding a secret to the repo's CI, and adding a dependency, service or abstraction layer that was not asked for.

---

# 3. UI work

The UI is small: an ask page with streamed answers and citations, a refusal state, preloaded demo questions, and later a retrieval playground. If the owner supplies a design, reproduce it exactly (layout, spacing, typography, color, states) and adapt it down to mobile without restyling. If not, keep it plain and fast to click through in a 90-second demo. Reuse existing components and Tailwind patterns before adding new ones; no component library unless asked.

- **The UI shows its evidence.** Citations are visible by default (expanded on mobile, never hidden behind a modal). A clicked `[n]` highlights its source passage and links to the section anchor.
- **A refusal is a designed state:** "I don't know" plus the closest section, never an empty box or a guess.
- Render `message.parts`, not `content`. Every interactive element needs a focus ring and a disabled state; never use color as the only signal.

---

# 4. Docs to lean on

API shapes, model IDs, prices and limits move. Fetch the real page before writing code against one, and never write them from memory. If you cannot verify something, write `VERIFY`. If a doc contradicts this file, the doc wins: tell the owner and update this file.

- `node_modules/next/dist/docs/`: routing, route handlers, server and client boundaries, caching.
- `node_modules/ai/docs` and `node_modules/@ai-sdk/openai/docs`: streaming, UI message parts, telemetry, embeddings, provider options. These match the installed versions.
- The vendor pages listed in `CLAUDE.md` → Reference docs: OpenAI models, pricing, embeddings and prompt caching; Supabase and pgvector; Langfuse.
- If your agent has Supabase skills (for example `supabase` and `supabase-postgres-best-practices`), use them for schema, RLS, migrations, indexes and pgvector work.

---

# 5. How the app is structured

One Next.js app plus offline scripts, in one repo.

```
app/                 pages and route handlers (api/chat, api/search); thin
lib/
  ingest/            loader, chunker, embedder: pure, no Next.js or Supabase imports
  retrieve/          vector, full-text, RRF, LLM rerank + fallback
  answer/            prompt, citation parsing and validation, refusal rule
  cost/              dated pricing table + cost calculation
  db/                server-only Supabase client, scoped to schema `citedesk`
  models.ts          the only place model IDs live
scripts/             CLI entry points (ingest, eval:*), run with tsx
evals/               questions, labels, scorer, baseline.json, runs/
supabase/migrations/ SQL for schema `citedesk`
prompts/             one implementation prompt per task
corpus/              downloaded source docs, gitignored; the pinned source version is recorded in `sources`
```

Create folders only when a task needs them. Keep these responsibilities apart:

- **Core** (`lib/ingest`, `lib/retrieve`, `lib/answer`). Pure code that takes its dependencies (DB client, model) as arguments and runs the same from a route, a script and an eval.
- **Routes** (`app/api`). Thin: parse input with Zod, call `lib/`, persist, respond. No retrieval or prompt logic inline.
- **Data access** (`lib/db`). A server-only Supabase client using the secret key, scoped to schema `citedesk`.
- **Model calls.** One wrapper records a `model_calls` row (JSONL when run from a script) for every LLM, embedding and rerank call: purpose, model, input/cached-input/output/reasoning tokens, cost, latency, outcome. Tokens come from the SDK response, never an estimate.
- **Prices** live in `lib/cost` with the date they were read from the vendor's pricing page. Never invent or recall a price.
- **UI.** Server components read; client components handle the chat input and citation interactions and call server routes for everything else.
- **Ingest and evals** are offline tooling. They never run in the request path, and the app never imports `evals/`.
- **Zod** is the single source of truth for every boundary (request bodies, model output, eval files). Infer types with `z.infer`; never keep a parallel hand-written type.

**Boundaries that never bend.** The browser never holds a key, never calls a model, and never writes to Postgres; server-only modules import `server-only`. Keep keys in `.env.local` only and keep `.env.example` current; nothing needs a `NEXT_PUBLIC_` variable. Touch only the `citedesk` schema, in CiteDesk's own Supabase project (`fscvgp…`); never the PaperTrail project. **Never ingest Third Way Health content or any real patient or client data**, even redacted. The corpus must be public or content the owner has the right to use; check its licence or permission before ingesting.

---

# 6. Tech stack

Next.js App Router, TypeScript strict, Tailwind · Vercel AI SDK (`ai`, `@ai-sdk/react`) · `@ai-sdk/openai` (Responses API) with OpenAI as the only model provider: answers `gpt-6-luna`, escalation `gpt-6.1-sol`, embeddings `text-embedding-3-small` (1536 dims), reranking by an LLM call (no reranker service) · Supabase Postgres + pgvector (HNSW) + `tsvector`, schema `citedesk` in CiteDesk's own Supabase project · Langfuse Cloud via AI SDK telemetry · Zod · Vitest · `tsx` for scripts · Vercel Hobby. Versions are exact-pinned in `package.json`.

Do not use: LangChain, LlamaIndex, a separate vector database, fine-tuning, an auth provider or multi-tenancy (demo mode only), payments, a new language or framework. Python only for an analysis notebook; metrics are computed in TypeScript so CI needs no Python.

---

# 7. Decisions already made

Build to these unless the owner changes them. Rationale and history are in `CLAUDE.md`; open questions stay open there until a measured run closes them.

- **Hybrid is the product; vector-only is a measured baseline.** Compare naive vector, hybrid, and hybrid + rerank on the same labelled set.
- **Citations are markers, not a provider feature.** Answers cite with `[n]`; code validates every marker against the chunks retrieved for that query. Provider-managed retrieval or citation features (for example file search; whether the Responses API offers a fitting citation option is VERIFY) would hide the retrieval being measured.
- **Refusal is decided in code**, from a retrieval score, before the model is asked to answer.
- **OpenAI only.** Model IDs live in `lib/models.ts` and nowhere else. The embedding model is fixed to the `vector(1536)` column; changing it means a new column or table and a full re-embed.
- **Rerank is optional at runtime.** Any failure falls back to the fused order.
- **Labels use `chunk_key`** (source path + anchor), never a database id, so re-chunking does not invalidate them.
- **Demo mode is public with no login**, so the answer route has a global daily cap counted from `model_calls` (`CITEDESK_DAILY_ANSWER_CAP`).
- **Open decisions** (corpus, chunk size, refusal score, rerank worth, contextual retrieval, judge model, eval set size) are answered by a measured run, recorded in the prompt file and in `CLAUDE.md`. Not by opinion.

---

# 8. The data you are modelling

Schema `citedesk` only. The relationships and named fields are fixed; choose the rest sensibly.

- **`sources`**: one row per source file: path, pinned commit or version, content hash, hash of the chunking settings.
- **`chunks`**: content, `heading_path`, `source_url`, `anchor`, `token_count`, `embedding vector(1536)`, `fts tsvector`, and its `chunk_key`.
- **`eval_questions`**: question, expected `chunk_key`s, whether it is answerable.
- **`eval_runs`**: one per run: config, models, prices-read date, cost, per-question results.
- **`query_log`**: query, config, retrieved ids and scores, rerank status, cited ids, refusal, tokens, cost, `latency_ms`.
- **`model_calls`**: one row per model call, whatever the outcome: purpose, model, tokens (input, cached-input, output, reasoning), `cost_usd`, `latency_ms`, outcome, error.

Match function: `match_documents`. HNSW index with the operator class matching the distance operator (cosine: `vector_cosine_ops` and `<=>`). RLS on, no policies, `service_role` only, as in PaperTrail. Schema changes are new files in `supabase/migrations/`, additive by default. Costs are USD `numeric`; durations are integer milliseconds; dates are ISO 8601.

---

# 9. How ingestion works

Ingest is offline tooling run with `npm run ingest`: loader → chunker → embedder → upsert into `chunks`.

- The loader derives each chunk's source URL and heading anchors deterministically from the file path and headings.
- The chunker follows the heading structure: a section absorbs its own sub-sections while the total stays within 800 tokens, and never reaches a sibling or the next section, so its anchor always points at a heading that contains it (owner decision 5 Nov; strict one-section chunks gave a median of 112 tokens). Longer sections split at block boundaries with ~15% overlap. Headings inside tabs, accordions and admonitions are text, not sections, because the site gives them no id. Fully unit-tested. Fixed-size chunking is the rejected alternative.
- Anchors are generated the way supabase.com renders them and checked against the live pages with `npm run corpus:check-anchors` (997 of 997 matched on 5 Nov). Re-run it after changing the pin or the loader.
- **Ingest is idempotent.** A content hash per file and a hash of the chunking settings are stored in `sources`; when both are unchanged, a file is neither re-chunked nor re-embedded. Changing chunk size or overlap is the deliberate exception and re-embeds everything: print the estimated cost before running it.
- Embeddings are batched and go through the model-call wrapper.
- Raw docs go in the gitignored `corpus/`. Record the pinned commit in `sources`.

---

# 10. How retrieval and answers must behave

- **Retrieve:** embed the query, run `match_documents` (vector) and a full-text query over `fts`, fuse with reciprocal rank fusion, optionally rerank, and pass the top chunks to the model. Set `hnsw.ef_search` per query so a top-50 candidate pull actually returns 50.
- **Refuse:** if the gating score is below the threshold (until open decision 3 closes, the top chunk's vector similarity), return "I don't know" plus the closest section. Do not call the answer model.
- **Answer only from the provided chunks.** Every sentence cites one or more chunks as `[n]`. If the chunks do not contain the answer, say so. Never invent a section, link or quote.
- **Prompt order:** the static system prompt first, retrieved chunks after it, so prompt caching can work.
- **Validate afterwards.** Every marker must map to a chunk retrieved for that query. An unmatched marker is a hallucinated citation: log it and count it. The target is zero.
- **Sources reach the UI first.** The route sends the retrieved sources (`chunk_key`, title, heading path, URL with anchor, snippet) before the answer text, so the UI can show them at once. The AI SDK's chatbot docs describe `sendSources` and `source-url` / `source-document` message parts: check them before inventing a data format.
- **Treat rerank output as untrusted.** Send candidates with short ids; validate that every returned id was a candidate and none repeats; on any error, timeout or invalid output fall back to the fused order and record `rerank: skipped`.
- **Log every query** to `query_log` and every model call to `model_calls`.

---

# 11. The eval suite

Evals are separate scripts (`npm run eval:*`), never part of `npm test`, because they cost money. Metrics, targets and the CI policy are in `CLAUDE.md`.

- **Scoring and normalisation live in one tested place** (`evals/`). A formatting mismatch is a scorer bug, not a model error; fix the scorer, never the data to fit it.
- Labels live in `evals/questions.json` and are keyed by `chunk_key` (a live URL with its `#anchor` also works; `evals/labels.ts` normalises both). A label must name a key that exists: `npm run eval:check` rejects unknown keys and names the parent when a sub-section was merged into its parent's chunk. Never label from search results (`eval:keys` lists a page's keys instead); that measures the system against itself. Per-question results record every stage (retrieved the labelled section? cited it? answer grounded?), so a failure is attributed to retrieval or generation, never just "wrong".
- Each run writes a file to `evals/runs/` with models, config, prices-read date, cost and results. Ablation rows come from run files, never from memory or estimates. `npm run eval:report` renders the README table and `evals/evidence.json` (the only eval numbers the app shows) from them, counting only runs on the full labelled set (`MIN_EVIDENCE_QUESTIONS`, 40); `--check` fails on drift. Runs on a smaller set are plumbing checks: don't commit them.
- Every runner prints its total cost and takes a spend cap. Do not run an eval in a loop.
- **Groundedness is judged per sentence** with one splitter (`splitSentences` in `lib/answer/citations.ts`) shared by the uncited count, the human labels and the judge. Labels live in `evals/labels/groundedness.json`, keyed by sentence hash, and are never shown a judge's output. `evals/rubric.md` is the judge's instructions verbatim; its hash is in every judge run. Below 85% agreement, edit the rubric, never the labels. Hallucinated citations (markers pointing at no retrieved source) are counted in code and are a different number from groundedness.
- In evals, shuffle candidate and evidence order for the reranker and the judge (position bias).
- `evals/baseline.json` is committed. CI fails if a headline metric drops more than 2 points below it. Change the baseline only on purpose, in its own commit, with the reason.

---

# 12. Things that will trip you up

You cannot infer these from the code. Docs were read on 2 Nov 2026.

- **AI SDK v7 differs from most tutorials.** Chat routes use `createUIMessageStreamResponse` with `toUIMessageStream`. Telemetry is `registerTelemetry(integration)`, not `experimental_telemetry`; for Langfuse that's `LangfuseVercelAiSdkIntegration` (`@langfuse/vercel-ai-sdk`) plus a `LangfuseSpanProcessor` on a `NodeTracerProvider` (`lib/telemetry.ts`; Langfuse's Next.js page still shows the v6 path). `@ai-sdk/otel` pins `ai` exactly, so its version must match ours (1.0.161 ↔ 7.0.161), and `@opentelemetry/sdk-node` 0.30x is outside `@langfuse/otel`'s peer range. The processor exports only GenAI/Langfuse spans by default: `shouldExportSpan` adds the `citedesk` tracer so `traced()` groups a question's calls into one trace. Serverless routes flush with `after()`; scripts flush in `main()`. Ingestion lags about a minute.
- **Our sources are written, not forwarded.** `toUIMessageStream({ sendSources })` only forwards a provider's own sources (Perplexity, Google). `/api/chat` writes `source-url` parts itself through `createUIMessageStream`, plus `data-passage` / `data-citations` / `data-refusal` parts (`lib/answer/ui-message.ts`). The streaming-data doc's `writer.write({ type: 'source', value })` example is stale: the installed types (and the protocol doc) say `{ type: 'source-url', sourceId, url, title }`. Pass `sendReasoning: false`, or reasoning summaries reach the browser. A non-200 response surfaces in `useChat` as `error.message` = the response body, so route error texts must be written for users.
- **v7 call options:** `generateText`/`streamText` take `instructions`, not `system` (renamed in v7; `system` is a deprecated fallback). GPT-6 models don't support `temperature` or `topP`: the provider drops them with a warning. Reasoning is the top-level `reasoning` option.
- **Prompt caching is prefix-based, and implicit mode breakpoints the latest message.** So every call cache-writes its whole prompt (1.25× input; price confirmed, the VERIFY is closed), and only an *exact* repeat reads it back (0.1×): the static instructions (~350 tokens) are under the 1,024-token minimum, so different questions share nothing. `cacheMode: "off"` sends explicit mode with no breakpoint, which disables caching (measured: 0 writes). **Measured 6 Nov (`npm run eval:cache`, run files in `evals/runs/`): implicit pays once more than 31% of questions are exact repeats within 30 minutes**, on both vector and hybrid + rerank. With rerank on, a repeat's *answer* call still misses, because the reranker's order isn't deterministic, so the answer prompt changes; the rerank call itself hits. Hits are best-effort (1 in 4 repeats missed). Read hits from `usage.inputTokenDetails.cacheReadTokens`; reasoning tokens are already inside `outputTokens`.
- **pgvector HNSW:** `hnsw.ef_search` (default 40) caps what an index scan returns. **Measured 5 Nov: `LIMIT 50` silently returned 40 rows at the default, and 50 at `ef_search` 50.** `match_documents` sets it to `greatest(match_count, 40)` for each call, so query through it, not with raw SQL. At this table size the planner may skip the index; force `enable_seqscan = off` when measuring. HNSW on `vector` supports up to 2,000 dims.
- **Custom schema:** `supabase-js` reaches `citedesk` only if the schema is exposed in the project's API settings and granted to `service_role`; a missing grant looks like an empty result. Functions need the grant too.
- **Migration versions:** the Supabase MCP's `apply_migration` records its own timestamp as the version, not the local filename's. After applying, read `list_migrations` and name the file `supabase/migrations/<that version>_<name>.sql`, or a later `supabase db push` will try to re-apply it (all three were renamed to match on 6 Nov).
- **Full-text language:** the `fts` text-search config (`'english'` in Supabase's example) must match the corpus language.
- **Full-text queries: OR the lexemes.** Supabase's example uses `websearch_to_tsquery`, which ANDs every word: for natural-sentence questions it matched 0 of 835 chunks (measured 6 Nov). `keyword_documents` ORs the question's lexemes and ranks by `ts_rank_cd` over the weighted `fts` (headings A, body B). A generated column can only call immutable functions and `array_to_string` is stable, hence the `citedesk.heading_text` wrapper.
- **The gate runs before the rerank** and reads the vector arm's top similarity in every mode, so a refused question never pays for a rerank and a keyword-only hit can't lift a question past the gate. A live rerank of 50 candidates cost $0.00148 and 3.4 s (11,160 input tokens, again almost all cache-written).
- **Evals and CI cost money.** `npm test` must never call a model, an embedding API or the network. **The eval gate needs the database too:** retrieval reads `citedesk.chunks`, so CI has `OPENAI_API_KEY`, `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as repo secrets (added 6 Nov, owner-approved) and runs with `CITEDESK_LOG_DB=0`, logging to JSONL only, so CI never counts toward the demo's daily cap or adds `eval_runs` rows.
- **The Next.js block above is managed.** `next dev` rewrites it; leave the markers alone.

---

# 13. Checks to run

Run them and report the real output. Never claim a check passed without running it.

```
npm run dev          # Next.js dev server
npm run build        # production build
npm run lint         # ESLint
npm run typecheck    # next typegen && tsc --noEmit
npm test             # Vitest, free
npm run test:watch
```

- `npm run typecheck`, `npm run lint` and `npm test` — always.
- `npm run build` — when routes, config or server modules change.
- `npm run dev` and click through — for UI changes.
- `ingest` and `eval:*` — only when the task is about them or the owner asks; report the cost. In `package.json`: `dev` serves `/demo` and `POST /api/chat`; `ingest`, `search`, `ask`; free eval tools `eval:check`, `eval:keys`, `eval:label` (interactive, no model) and `eval:report`; paid runners `eval:retrieval`, `eval:threshold`, `eval:generation` and `eval:judge` (each prints an estimate and takes `--max-usd`; `--questions=` points a plumbing run at a scratch file). Gate tools: `eval:cache` (T38 measurement), `eval:baseline`, `eval:gate` and `eval:smoke` (see `.github/workflows/`).

---

# 14. Build guide

Work the tasks in order; a task needs the ones before it. Legend: 📝 write an implementation prompt in `prompts/` and get approval before coding (other tasks need one only if non-trivial) · 🎓 teaching moment: explain the decision and the rejected alternative in 2–3 sentences · ✋ the owner does the hand work; prepare it, then stop and hand over.

### Phase 0: Decisions that unblock everything
- **T01** Choose the corpus (open decision 1). Verify the licence, pin the commit SHA, and pick the subset that lands at 300–1000 chunks. Write the 10 unanswerable questions' topics now, while reading the corpus.
- **T02** Decide which score gates the refusal (open decision 3). Recommendation: the top chunk's vector similarity.

### Phase 1: Database and cost plumbing
- **T03** 📝 Migration: schema `citedesk`, the `vector` extension, and the tables `sources`, `chunks`, `eval_questions`, `eval_runs`, `query_log`, `model_calls`. RLS on, no policies, `service_role` grants, schema exposed in API settings. 🎓 Embedding dimension and model as a schema decision.
- **T04** `lib/db`: a server-only Supabase client scoped to `citedesk`, plus a smoke test that a grant failure isn't mistaken for an empty result.
- **T05** `lib/cost`: the dated pricing table and cost maths, with Vitest tests. Anything unverified is marked VERIFY, including cache-write pricing.
- **T06** Model-call wrapper: records a `model_calls` row (JSONL from scripts) for every LLM, embedding and rerank call. Tokens come from the SDK response.

### Phase 2: Ingest (minimum scope 1–2)
- **T07** 📝 Loader: reads `.mdx` files and derives the source URL and heading anchors deterministically.
- **T08** 🎓 Chunker: by heading, sub-sections merged up to 800 tokens, ~15% overlap when splitting, with heading path and token count. Tests come with it. Rejected alternative: fixed-size chunking.
- **T09** Embedder: batched `text-embedding-3-small` calls through the wrapper.
- **T10** `npm run ingest`: idempotent via per-file and chunk-settings hashes in `sources`. Print the cost before a full re-embed.
- **T11** 🎓 HNSW index (cosine ops) and the `match_documents` function, with the grants. Verify the `ef_search` behaviour. Rejected alternative: IVFFlat.
- **T12** ✋ Run the ingest and sanity-check 10 questions by hand. This closes week 1's goal.

### Phase 3: Vector-only answers (minimum scope 4 and 6, server side)
- **T13** `lib/retrieve` vector search with `ef_search` set per query.
- **T14** 📝 `lib/answer` prompt: static system prompt first, chunks after, so caching can work later.
- **T15** Citation parser/validator: every `[n]` must map to a retrieved chunk; unmatched markers are counted. 🎓 Markers validated in code vs provider-managed citations.
- **T16** Refusal rule: "I don't know" plus the closest section, gated by the T02 score.
- **T17** `query_log` writes: records retrieval, rerank status, refusal and cost per query.

### Phase 4: Retrieval eval baseline
- **T18** 📝 Zod schemas for questions and labels, keyed by `chunk_key`, plus the scorer. Normalisation lives in `evals/`.
- **T19** 🎓 Metrics with tests: recall@5, recall@20, MRR, nDCG@10.
- **T20** ✋ Write and label the 40 questions (the heaviest hand work; flag overruns early). Start with 40 and grow to 50 only before the first baseline (open decision 9).
- **T21** `eval:retrieval` runner that writes `evals/runs/YYYY-MM-DD-*.json` with models, config, prices-read date, cost and per-stage results.
- **T22** Run naive vector and record the baseline row.

### Phase 5: Hybrid and rerank, with the ablation
- **T23** 🎓 Full-text: the `fts` column and GIN index (config matches the corpus language), plus the full-text query.
- **T24** 🎓 RRF fusion with tests, then re-measure hybrid.
- **T25** 🎓 LLM listwise rerank: top-50 to top-8, with id validation, fallback to fused order and `rerank: skipped`. It shuffles candidates in evals. Re-measure.
- **T26** Decide open decisions 4 and 6 (is rerank worth it?) from the table. Decide open decision 5 (contextual retrieval); if yes, add it as its own task plus a re-measure.
- **T27** `eval:report`: renders the README ablation table between markers, with `--check` for drift.

### Phase 6: Product surface (minimum scope 3–6)
- **T28** 📝 `api/chat` route: Zod input, retrieval, sources sent first, answer streamed, validated afterwards. Check the SDK's `source-url` / `source-document` parts first. 🎓 Streaming.
- **T29** Chat UI rendering `message.parts`, with citations visible by default and `[n]` linking to the anchor.
- **T30** Refusal UI: "I don't know" with the closest section.
- **T31** Demo mode: sample questions preloaded, no login.
- **T32** Daily answer cap (`CITEDESK_DAILY_ANSWER_CAP`) counted from `model_calls`.

### Phase 7: Generation evals
- **T33** ✋ Write the 10 unanswerable questions, then sweep the refusal threshold and close open decision 3.
- **T34** `eval:generation`: citation precision, hallucinated-citation count (must be 0, checked in code), refusal rate and groundedness inputs.
- **T35** ✋ 🎓 Write the groundedness rubric first, then hand-label 30 outputs before running the judge.
- **T36** 🎓 Judge (open decision 8): sol vs luna on the same 30, evidence order shuffled. Report agreement, Cohen's kappa and the confusion matrix. Iterate the rubric, never the labels, until ≥85%.
- **T37** Diagnosis table: retrieval hit × grounded answer, with each failure attributed to a stage.

### Phase 8: Operations and regression gate
- **T38** 🎓 Prompt caching: measure the cache hit ratio and cost drop. VERIFY cache-write pricing first, and let the README claim only what the run file shows.
- **T39** 🎓 Langfuse tracing via `registerTelemetry` (v7 path). VERIFY the free-tier limits.
- **T40** Commit `evals/baseline.json` in its own commit, then `eval:gate` (2-point rule) and `eval:smoke` (retrieval-only).
- **T41** GitHub Action: smoke on push, full suite on PRs to `main`, skipped without the secret, SHA-pinned, with a spend cap and the run file uploaded as an artifact. Ask before adding the secret.
- **T42** Retrieval playground: chunks, scores before and after rerank, and which were cited.

### Phase 9: Deploy and ship
- **T43** Vercel Hobby deploy: env vars (ask first), build check, and a demo-mode smoke test on the live URL.
- **T44** Click-a-citation-to-highlight. Technically a stretch item, but the demo needs it.
- **T45** README: architecture diagram, ablation table, diagnosis table and the judge-calibration numbers. Competitor claims are linked, dated and marked vendor-claimed.
- **T46** Case study on danielcolorado.dev, drawn from the project log. Move the project out of "In the lab" only now.
- **T47** ~~90-second demo video~~ Dropped by the owner on 6 Nov 2026; the live demo and the README carry the story.
- **T48** Check all five done-criteria and confirm the eval gate is green in CI.

---

# 15. When in doubt

Keep it small. Read the doc instead of guessing. Measure instead of claiming. Keep keys on the server and real data out of the repo. Preserve the boundaries between core, routes and UI. Cite only what retrieval returned, and refuse when it did not. Save a prompt and get approval before coding. Run the checks. Share exact test steps. Teach the decision you just made.
