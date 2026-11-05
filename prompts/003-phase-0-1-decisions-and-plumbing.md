# 003 — Phase 0 decisions and Phase 1 plumbing (T01–T06)

**Status:** done, except applying the T03 migration (see Results)
**Branch:** `feat/db-cost-plumbing`, stacked on `feat/landing-motion` (PR #1, still open). Retarget it to `main` once #1 merges.
**Week:** 1 (build guide Phase 0 and Phase 1)

## Goal

Close the two Phase 0 decisions (T01 corpus, T02 refusal gate) in `CLAUDE.md`. Then build the plumbing everything else stands on:

- the `citedesk` schema and its six tables (T03);
- a server-only DB client that can't mistake a grant failure for an empty result (T04);
- a dated pricing table with cost maths (T05);
- the model-call wrapper that logs every call (T06).

No model or embedding calls.

## Docs read

- **GitHub API, 5 Nov 2026:**
  - `supabase/supabase` master is at `aa9d04e4f77447e2b6aaf317b686007aff05aa96` (committed 2026-11-05T21:30Z).
  - The repo licence is Apache-2.0. There is no LICENSE, NOTICE or separate content licence in `apps/docs`, and no root `NOTICE` file.
  - The guides are 553 `.mdx` files under `apps/docs/content/guides/`.
- **Path → URL mapping, spot-checked:** `apps/docs/content/guides/database/postgres/indexes.mdx` maps to `https://supabase.com/docs/guides/database/postgres/indexes`, and `.../ai/vector-columns.mdx` to its page. Both URLs return HTTP 200.
- **OpenAI pricing page, read 5 Nov 2026,** standard tier, short context, per 1M tokens:

  | Model | Input | Cached input | Cache write (30m / 12h) | Output |
  | --- | --- | --- | --- | --- |
  | `gpt-6-luna` | $0.10 | $0.01 | $0.125 / $0.25 | $0.50 |
  | `gpt-6.1-sol` | $2.00 | $0.10 | $2.50 / $5.00 | $10.00 |
  | `gpt-6.1-terra` | $1.00 | $0.05 | $1.25 / $2.50 | $5.00 |

  `text-embedding-3-small` is $0.02 input, with no cache prices. **This resolves the cache-write VERIFY** in `CLAUDE.md`: cache writes are now in the table, at 1.25× (30m) and 2.5× (12h).
- **`node_modules/ai/dist/index.d.ts` (ai 7.0.161), `LanguageModelUsage`:**
  - `inputTokens`;
  - `inputTokenDetails.{noCacheTokens, cacheReadTokens, cacheWriteTokens}`;
  - `outputTokens`;
  - `outputTokenDetails.{textTokens, reasoningTokens}`;
  - `raw`.

  Every field is `number | undefined`. `EmbeddingModelUsage` is `{ tokens: number }`.
- **Supabase MCP (read-only), project `fscvgp…` from this repo's `.mcp.json` and `.env.local`:** an empty project with only Supabase's own schemas and no `papertrail` schema. `vector` 0.8.2 is available but not installed. This is **not** the shared "lab" project (`zatpmd…`, where PaperTrail lives). See Needs a decision.
- **At build time:** the `supabase-postgres-best-practices` skill gets loaded before the migration is written. Its rules win over anything below.

## Code inspected

- `lib/models.ts` — model IDs and embedding dimensions; unchanged.
- `.gitignore` — ignores `.env*` except `.env.example`, but **`.env.example` was never committed and no longer exists**. It appears to have been renamed to `.env.local`, which has the same variable names. Recreating it is in scope.
- **PaperTrail's patterns:**
  - **Migration:** `supabase/migrations/20261101120000_extractions.sql` — RLS on, no policies, `service_role` grants, identity primary keys, check constraints, a foreign-key index, and a `created_at` index for the daily cap.
  - **Pricing:** `lib/cost/pricing.ts` — a dated `PRICES` table, `UnknownModelPriceError`, and cost rounded to 8 decimals.
  - **DB client:** `lib/db/client.ts` imports `server-only`.
- `vitest.config.ts` — `**/*.test.ts`, no `server-only` shim. Server-only modules therefore can't be imported in tests, so testable logic lives in plain modules.

## Decisions and assumptions

**Phase 0 (recorded in `CLAUDE.md` once you answer):**

- **T01 corpus, recommended:** Supabase docs, sections `guides/database` and `guides/ai`, pinned at `aa9d04e`. That's 94 + 35 files.
  - **Size estimate:** at about 4 bytes per token and 650 tokens per chunk, this is roughly 380 chunks before overlap. Heading boundaries and 15% overlap push it up, so the expected landing is 400–700, inside 300–1000. The estimate counts MDX, frontmatter and code, so T12 measures the real number.
  - **Licence:** Apache-2.0 allows redistributing excerpts with attribution. The UI and footer will say "Source: Supabase docs (Apache-2.0), commit aa9d04e. Not affiliated with Supabase."
  - **Alternative:** `auth` + `database`, about 650 chunks.
- **T01, ten unanswerable topics, proposed.** Each sits outside the subset but is something a model plausibly knows, which is the trap called out in open decision 1. T33 checks each against the ingested chunks before writing the real questions.
  1. Enabling TOTP MFA in Supabase Auth
  2. A custom SMTP server for auth emails
  3. The Storage upload size limit and resumable uploads
  4. Edge Function cold starts
  5. Realtime Broadcast rate limits
  6. Compute add-on prices
  7. Required env vars for self-hosting with Docker
  8. Branching previews with GitHub
  9. Creating an index in MongoDB
  10. Firestore security rules
- **T02 refusal gate:** the cosine similarity of the top vector-search chunk (`1 − (embedding <=> query)`). RRF scores are rank-based and not comparable across queries, and rerank is optional. The threshold value stays empty until T33's sweep.

**Phase 1:**

- **`fts` and indexes wait for their tasks.** The `fts tsvector` column and its GIN index are added in T23, as the build guide says, because the text-search language depends on T01. The HNSW index and `match_documents` are T11. T03 creates tables only.
- **`chunk_key` isn't unique.** A long section splits into several chunks that share one `chunk_key` (source path + anchor), which is what section-level labels need. Uniqueness is `(source_id, ordinal)`.
- **`embedding vector(1536) not null`.** A chunk row is written only together with its embedding (T10), so a half-ingested chunk can't exist.
- **The `vector` extension goes in the `extensions` schema** (Supabase's convention), referenced as `extensions.vector(1536)`.
- **`model_calls` records cache writes too:** `cache_write_tokens` sits next to input, cached-input, output and reasoning. The SDK reports it and the price is now known. Writes are costed at the 30-minute rate, the default TTL for these models. A 12-hour TTL is never set in this project; if that changes, the cost table needs the second column.
- **Cost formula,** per 1M tokens: `noCache × input + cacheRead × cachedInput + cacheWrite × cacheWrite30m + output × output`. Reasoning tokens are already inside `outputTokens`, as PaperTrail found. When `noCacheTokens` is missing, it is derived as `inputTokens − cacheRead − cacheWrite`. *Assumption:* OpenAI counts cache writes inside `input_tokens`. The wrapper also stores `usage.raw`, so T09/T14's first live call can confirm it.
- **The wrapper is sink-based:** `recordCall(sink, meta, run)` times the call, reads usage from the SDK result, prices it, writes one record, and re-throws errors after logging them as `api_error`. Two sinks share one record shape:
  - `jsonlSink(path)` for scripts (`logs/model-calls.jsonl`, already gitignored);
  - `dbSink(client)` for routes (`citedesk.model_calls`).

  Streaming calls use the same record builder from `onFinish`, wired in T28.
- **Purposes are a closed set:** `embed_document`, `embed_query`, `answer`, `rerank`, `judge`, `context`. Outcomes: `ok`, `api_error`, `invalid_output`.
- **The DB result helper is a plain module.** `lib/db/result.ts` (`unwrap()`) is unit-tested; `lib/db/client.ts` imports `server-only`. A PostgREST error, including the 42501 permission error that a missing grant produces, always throws with its code. An empty array is returned only when there's no error.
- **Live check is a script, not a test:** `npm run db:smoke` reads every table and reports either a row count or a coded error. It needs the network and keys, so `npm test` never runs it.
- **The `eval_runs` and `query_log` columns are a first cut.** T18/T21 and T17 may add columns in additive migrations.
- **Assumption:** the migration file is applied with the Supabase MCP `apply_migration`, after you approve this prompt and answer which project to use. The file is also committed under `supabase/migrations/`.

## What this teaches

**T03 🎓, embedding dimension and model as a schema decision.** The `vector(1536)` type fixes the dimension in the table definition, and vectors from different models live in unrelated spaces even at the same dimension. Changing the embedding model is therefore a migration plus a full re-embed, not a config change. The rejected alternative is an untyped `vector` column with the dimension left open. It can't be indexed with HNSW, and it would let vectors from two models mix silently, giving similarity scores that mean nothing.

## Files to touch

- `CLAUDE.md` — edit:
  - close open decision 1 (T01) with the facts above and the ten topics, and decision 3's first half (T02: which score gates);
  - cost model: replace the cache-write VERIFY with the 5 Nov prices;
  - tick T01–T06;
  - add a project-log line.
- `.env.example` — create — variable names only, matching `.env.local`, with comments.
- `supabase/migrations/20261105120000_citedesk_schema.sql` — create — schema, `vector` extension, six tables, RLS, grants.
- `lib/db/result.ts` + `lib/db/result.test.ts` — create — `unwrap()`, and a typed `DbError` carrying `code`.
- `lib/db/client.ts` — create — `server-only`, `createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { db: { schema: "citedesk" }, auth: { persistSession: false } })`, failing fast when either env var is missing.
- `lib/cost/pricing.ts` + `lib/cost/pricing.test.ts` — create — `PRICES`, `PRICING_READ_ON = "2026-11-05"`, `callCostUsd`, `embeddingCostUsd`, `UnknownModelPriceError`.
- `lib/calls/record.ts` + `lib/calls/record.test.ts` — create — Zod `ModelCallRecord`, `usageFromLanguageModel`, `usageFromEmbedding`, `buildRecord`, `recordCall`.
- `lib/calls/sinks.ts` — create — `jsonlSink`, `dbSink`.
- `scripts/db-smoke.ts` + `package.json` script `db:smoke` — create — run with `node --env-file-if-exists=.env.local --conditions=react-server --import tsx`, as PaperTrail does.

## Requirements

1. The migration is additive only (`create schema if not exists`, `create extension if not exists ... schema extensions`, `create table`), with no drops.
2. **Tables:**
   - **`sources`:** path (unique), `source_url`, `commit_sha`, `content_hash`, `chunking_hash`, `ingested_at`.
   - **`chunks`:** `source_id` (FK, on delete cascade), `ordinal`, `chunk_key`, `content`, `heading_path text[]`, `anchor`, `source_url`, `token_count > 0`, `embedding`, `created_at`.
   - **`eval_questions`:** question, `expected_chunk_keys text[]`, answerable.
   - **`eval_runs`:** kind (`retrieval`, `generation`, `judge`), config jsonb, models jsonb, `prices_read_on` date, `cost_usd`, results jsonb, `created_at`.
   - **`query_log`:** query, config jsonb, retrieved jsonb, `rerank_status` (`applied`, `skipped`, `off`), `cited_chunk_ids bigint[]`, refused, tokens, `cost_usd`, `latency_ms`, `created_at`.
   - **`model_calls`:** `query_id` (nullable FK, on delete set null), purpose, model, outcome, `input_tokens`, `cached_input_tokens`, `cache_write_tokens`, `output_tokens`, `reasoning_tokens`, `cost_usd numeric(12,8)`, `latency_ms`, error, raw_usage jsonb, `created_at`.
3. Identity primary keys, `not null` where meaning requires it, `check` constraints on enums and non-negative counts, and indexes on every foreign key plus `model_calls(created_at)` for the daily cap.
4. RLS on for every table, no policies. Usage on the schema and table privileges go to `service_role` only. Nothing is granted to `anon` or `authenticated`.
5. `unwrap()` throws `DbError` (message, code, details) whenever `error` is set, and returns `data` (an empty array included) only when it isn't.
6. `callCostUsd` throws `UnknownModelPriceError` for an unpriced model and never returns a guessed price. It rounds to 8 decimals.
7. `recordCall` writes exactly one record per call, ok or failed. Latency is wall clock in integer ms. On failure it records `api_error` with the error message and re-throws.
8. `npm test` stays offline. No test touches the network, a key or the database.

## Security and data safety

- **Keys stay server-side:** the client reads `SUPABASE_SECRET_KEY` only in a `server-only` module and in the smoke script. `.env.example` holds names, never values.
- **Database access:** RLS with no policies plus `service_role`-only grants means the publishable key can't read any `citedesk` table.
- **Raw usage:** `raw_usage` stores the provider's usage object only (token counts), never prompts or answers.
- **Data:** no corpus content is fetched or stored in this task.

## Cost impact

$0. No model or embedding calls. The migration and smoke script run against the database only.

## Acceptance criteria

- [ ] `CLAUDE.md` records T01 and T02 as decided, with the date, and the cache-write VERIFY is gone.
- [ ] The migration applies cleanly, and the Supabase security advisor shows no new issue for `citedesk` (RLS on, no exposure to `anon`).
- [ ] `npm run db:smoke` prints a row count of 0 for all six tables after you expose the `citedesk` schema in the API settings. Before that, it prints a coded error rather than an empty result.
- [ ] Unit tests cover:
  - `unwrap` (error vs empty vs data);
  - cost maths (each token class, cache writes, unknown model, rounding);
  - usage extraction (missing fields, derived `noCacheTokens`);
  - `recordCall` (one record on success, one on failure, then a re-throw).
- [ ] typecheck, lint, test and build all pass.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- Supabase MCP: `apply_migration`, then `list_tables` for `citedesk`, then `get_advisors` (security)
- `npm run db:smoke`, before and after the schema is exposed

## Manual test steps

1. In the Supabase dashboard for the chosen project: Settings → API → Exposed schemas → add `citedesk`.
2. `npm run db:smoke`: six lines, each `0 rows`.
3. Optional: run `npm run db:smoke` before step 1, to see the coded error that proves a missing grant or exposure isn't read as "empty".

## Results

Built 5 Nov 2026 on `feat/db-cost-plumbing`. $0, with no model or embedding calls.

- **Phase 0:**
  - **T01:** the owner picked Supabase `database` + `ai` at `aa9d04e`.
  - **T02:** the owner picked top vector similarity.
  - **Supabase project:** the owner picked the shared lab project `zatpmd…`.
  - All three are recorded in `CLAUDE.md`, with the ten unanswerable topics.
- **Checks:** typecheck, lint and build pass. `npm test` passes 40 tests, 32 of them new:
  - `unwrap`: 7;
  - pricing: 7;
  - usage, `recordCall` and sinks: 10;
  - the existing landing and model tests.
- **Prices re-read 5 Nov:** unchanged for luna, sol and terra. Cache-write columns now appear on the pricing page (luna $0.125 for 30m), which closes that VERIFY.
- **Found:**
  - `.env.example` had never been committed. It has been recreated, with names only.
  - The repo pointed at a new, empty Supabase project. `SUPABASE_URL` and `.mcp.json` now point at the lab project; no key was read or copied.
- **Not done yet: applying T03.** This session's Supabase MCP connection was opened against the old project, so applying from here would create the schema in the wrong place. It waits on two things:
  1. the lab project's `SUPABASE_SECRET_KEY` in `.env.local`;
  2. a Claude Code restart, so the MCP reconnects to the lab project.

  After that come `apply_migration`, the security advisors, exposing `citedesk` in the API settings, and `npm run db:smoke`. The migration SQL hasn't been executed anywhere yet, so its first apply is also its syntax check.
- **Assumption still open:** cache writes counted inside `inputTokens`. `raw_usage` is stored so T09/T14's first live call can confirm it.
