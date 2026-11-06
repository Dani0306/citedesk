# 004 — Phase 2: ingest (T07–T12)

**Status:** done (T07–T11); T12's 10 searches are the owner's
**Branch:** `feat/ingest` (from `main` after PR #2)
**Week:** 1 (build guide Phase 2; T12 closes week 1's goal)

## Goal

The pinned Supabase docs subset is fetched, parsed, chunked by heading, embedded with `text-embedding-3-small`, and stored in `citedesk.chunks`. Re-running ingest is idempotent and costs nothing when nothing changed. An HNSW index and `match_documents` answer a vector query. `npm run search "…"` lets the owner sanity-check 10 questions by hand (T12).

## Docs read

- **Corpus, measured 5 Nov 2026:** a shallow, sparse, blobless git checkout of `supabase/supabase` at `aa9d04e`, limited to `apps/docs/content/guides/{database,ai}/`. It took 2 s and 4.4 MB, and gave exactly the 129 `.mdx` files from T01. Constructs found across those 129 files:
  - YAML frontmatter on every file (`title` on all 129).
  - Headings: 541 `##`, 435 `###`, 63 `####`. The 39 `#` matches are mostly shell or SQL comments inside code.
  - 260 indented code fences, inside `<TabPanel>`.
  - JSX wrappers that hold real content: `<TabPanel>` (326), `<$Show>` (138), `<Admonition>` (127), `<Tabs>`, `<StepHikeCompact.*>`, `<Accordion*>`.
  - Decorative JSX: `<Image>`, `<YouTube>`.
  - 15 `<$Partial path=…>` includes. All four partials live in `apps/docs/content/_partials/`.
  - Explicit heading anchors `### Title [#custom-id]` in 20 files.
  - 75 `{/* … */}` MDX comments.
  - 12+ files with no `##` heading at all.
- **Supabase's own heading ids:** `packages/ui-patterns/src/Toc/mdx-plugins/remark-heading.ts` at `aa9d04e`.
  - An explicit `[#id]` wins (regex `/\s*\[#([^]+?)]\s*$/`).
  - Otherwise `github-slugger` v2 (`^2.0.0`) runs on `flattenNode(heading)`, which joins the text of child nodes with no separator.
  - The slugger is **stateful per page**, so a repeated heading gets `-1`, `-2` suffixes.
- **Live ids, fetched from supabase.com:**
  - `database/import-data` gives `option-1-csv-import-via-supabase-dashboard` and `1-back-up-your-data`.
  - `database/joins-and-nesting` gives `what--and--mean-in-join-syntax`, `left-join-default` and `inner-join--inner-`.

  The last one doesn't follow from the code read. That's why anchors are **verified against the live site** in this task, not assumed.
- **OpenAI embeddings guide:** "For third-generation embedding models like `text-embedding-3-small`, use the `cl100k_base` encoding." Max input is 8,192 tokens.
- **`node_modules/ai/docs/03-ai-sdk-core/30-embeddings.mdx`:** `embedMany({ model, values, maxParallelCalls })` returns `usage: { tokens }`. The provider factory is `openai.embedding(id)`, and `dimensions` is optional (default 1536).
- **Supabase "Vector columns" guide (MCP `search_docs`):**
  - supabase-js inserts a `vector` column as a plain number array;
  - similarity search goes through `rpc()`;
  - `order by` must sort on the distance expression itself, or the index is ignored.
- **Supabase pgvector guide:** with HNSW or IVFFlat, a filtered query can return fewer rows than requested. The plain `ef_search` cap on a top-50 pull is measured in T11, not assumed.
- **npm, 5 Nov:**
  - `gpt-tokenizer` 4.1.0: MIT, no dependencies, published 2026-10-18, includes `cl100k_base`.
  - `github-slugger` 2.0.0: ISC, no dependencies, the version Supabase pins.
  - Rejected: `js-tiktoken` 1.0.21 (has a dependency, not updated since 2025).

## Code inspected

- `supabase/migrations/20261105120000_citedesk_schema.sql`:
  - `sources(path unique, source_url, commit_sha, content_hash, chunking_hash)`;
  - `chunks(source_id, ordinal, chunk_key, heading_path text[], anchor, source_url, content, token_count, embedding vector(1536) not null)`;
  - no HNSW index yet.
- `lib/calls/record.ts` (`recordCall`, `fromEmbedding`), `lib/calls/sinks.ts` (`jsonlSink`), `lib/cost/pricing.ts` (`text-embedding-3-small` at $0.02 per 1M), `lib/db/{client,result}.ts`, `lib/models.ts` (`EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`).
- `.gitignore`: `/corpus` and `/logs` are already ignored.

## Decisions and assumptions

- **Two dependencies** (owner approval needed, asked with this prompt):
  - `gpt-tokenizer` for exact `cl100k_base` token counts. The 500–800 bounds and the cost preview depend on them.
  - `github-slugger` so anchors use the same library and version as supabase.com.

  Rejected alternatives: characters ÷ 4 (it drifts badly on code), and a hand-written slugger (it would drift from Supabase's).
- **Corpus fetch:** `npm run corpus:fetch` makes a shallow, sparse git checkout of the pinned SHA into the gitignored `corpus/supabase/`, covering `guides/database/`, `guides/ai/` and `_partials/`. The repo, SHA, paths and URL base live in one module, `lib/ingest/corpus.ts`. Rejected: 129 GitHub API calls (slower, rate-limited, no gain).
- **Loader (T07), a line-based parser, no MDX/remark dependency:**
  - Strips frontmatter (keeping `title`), top-level `import`/`export` ESM lines (never inside code), MDX comments, and decorative JSX (`Image`, `YouTube`).
  - Removes wrapper JSX tags (`Tabs`, `TabPanel`, `$Show`, `Admonition`, `StepHikeCompact.*`, `Accordion*`) but keeps their content.
  - Inlines `<$Partial path>` from `_partials/` before parsing headings, as the site renders them.
  - Tracks code fences, including indented ones, so `#` inside code is never a heading.
  - Heading text is flattened the way mdast does: inline code keeps its text, links keep their text, emphasis markers drop. Then `[#id]` wins, else a per-file `github-slugger` instance.
  - Source URL: `https://supabase.com/docs/guides/<path>` (spot-checked at HTTP 200).
  - Rejected alternative: a full remark/MDX parse. It's heavier, and the site's custom components would still need special-casing.
- **Anchors are measured, not assumed.** `npm run corpus:check-anchors` fetches each of the 129 live pages (sequentially, with a delay) and reports how many of our anchors exist as `id` attributes. Mismatches are listed. The live site may have drifted from the pin, so the report shows that too. Target: ≥ 95% exact.
- **Chunker (T08 🎓):**
  - **Sections:** a section runs from one heading to the next heading of any level, and a chunk never spans two sections. Text before the first heading is its own section, with anchor `""` and the page URL.
  - **Size:** a section ≤ 800 tokens is one chunk, even when it's under 500. Merging tiny sections would cross a heading.
  - **Splitting long sections:** a longer section is split at block boundaries (paragraphs, list items, whole code fences) into chunks of at most 800 tokens, each starting with the last blocks of the previous chunk, about 15% (~120 tokens) of overlap. A single block over 800 tokens is split by lines.
  - **The 500 floor is a target, not a guarantee.** The size distribution is reported so open decision 2 can tune it.
- **Stored text vs embedded text:**
  - `content` stores the section text without its heading line.
  - The **embedded** text is `title › heading path` plus a blank line plus the content. The path tells the model which topic a short section belongs to.
  - This is a fixed prefix, not contextual retrieval (open decision 5 is the model-written version).
- **`chunk_key`:** `<path>#<anchor>` (for example `database/postgres/indexes#create-an-index`), or `<path>` for the preamble. It's shared by every chunk of a section.
- **Embedder (T09):** `embedMany` in batches of 100 chunks, `maxParallelCalls: 2`. Each batch is one `recordCall` (`purpose: "embed_document"`) to `logs/model-calls.jsonl`, plus a `citedesk.model_calls` row.
- **Ingest (T10), idempotent and resumable:**
  - `chunking_hash` = sha256 of the chunker settings plus a version number. `content_hash` = sha256 of the file after partials are inlined.
  - When both match the stored row, the file is skipped.
  - Otherwise, in this order: embed → upsert the source with `content_hash = ''` → delete its old chunks → insert the new ones → write the real hashes last. A crash at any point leaves a mismatched hash, so the next run redoes that file.
  - Files no longer in the corpus are deleted (their chunks cascade). That's a data change inside our own tables, printed before it happens.
- **Spend guard:**
  - Plain `npm run ingest` is a dry run: files to redo, chunks, tokens, estimated cost.
  - `--yes` spends, and aborts above `--max-usd`, default `0.10`.
  - **Estimated cost of the first full run: ~$0.01** (~300–500k tokens at $0.02 per 1M). The real cost comes from the usage the API reports and is printed at the end.
- **T11 (🎓), new migration `20261106120000_match_documents.sql`:**
  - The HNSW index: `create index … using hnsw (embedding extensions.vector_cosine_ops)`, with the default `m` 16 and `ef_construction` 64.
  - The function: `citedesk.match_documents(query_embedding vector(1536), match_count int default 10)`.
    - It's PL/pgSQL with `security invoker` and `set search_path = ''`, so every name is schema-qualified, including `operator(extensions.<=>)`.
    - It runs `set_config('hnsw.ef_search', greatest(match_count, 40), true)` before the query.
    - It returns `id, chunk_key, heading_path, anchor, source_url, content, similarity = 1 − distance`, ordered by the distance expression.
  - `execute` is revoked from `public`, `anon` and `authenticated` and granted to `service_role`. Functions are executable by `PUBLIC` by default, which would bypass the server-only rule.
- **`ef_search` is measured.** After ingest, the same top-50 query runs with `ef_search` 40 and then 50 (sequential scan disabled, so the index is used), and the row counts are recorded. That closes the VERIFY in `AGENTS.md` §12.
- **T12 (✋) tooling:** `npm run search "question"` embeds the question (`purpose: "embed_query"`, about $0.000001) and prints the top 5 with similarity, heading path and the source URL with its anchor. That's enough for a by-hand check; `lib/retrieve` proper is T13.
- **Assumption:** `<$Show if=…>` content is kept. It's real docs text gated by site feature flags. If T12 shows it adding noise, it can be dropped later.

## What this teaches

- **T08, chunking by heading:** a heading is the author's own topic boundary, and the citation anchor belongs to the section. A chunk that stays inside one section has exactly one correct link. The rejected alternative, fixed-size windows, cut sections mid-thought and give chunks whose single anchor is wrong for part of their text. The cost is uneven chunk sizes, which open decision 2 measures.
- **T11, HNSW vs IVFFlat:**
  - **HNSW** builds a layered neighbour graph. It has a better recall-for-speed trade-off, can be built on an empty table, and stays good as rows are added.
  - **IVFFlat** (rejected) clusters existing rows into lists. It needs data before it's built, degrades as the data drifts, and needs `probes` tuned.
  - At this size (hundreds of rows) Postgres may skip the index entirely. That's why the `ef_search` measurement forces index use.

## Files to touch

- `package.json` / `package-lock.json` — edit:
  - dependencies: `gpt-tokenizer@4.1.0`, `github-slugger@2.0.0` (exact pins);
  - scripts: `corpus:fetch`, `corpus:check-anchors`, `ingest`, `search`.
- `lib/ingest/corpus.ts` — create — repo, pinned SHA, include paths, URL base, file → URL and path → `chunk_key` helpers.
- `lib/ingest/mdx.ts` + `mdx.test.ts` — create — frontmatter, ESM, comments, JSX stripping, partial inlining, fence tracking, heading flattening and slugs → `Section[]`.
- `lib/ingest/chunk.ts` + `chunk.test.ts` — create — token counting, section splitting with overlap, `chunkingHash`.
- `lib/ingest/embed.ts` + `embed.test.ts` — create — batched `embedMany` through `recordCall`, with an injected embed function in tests.
- `lib/ingest/plan.ts` + `plan.test.ts` — create — compares corpus hashes with stored `sources` and produces the plan (redo, skip, delete) plus the cost estimate.
- `scripts/corpus-fetch.ts`, `scripts/corpus-check-anchors.ts`, `scripts/ingest.ts`, `scripts/search.ts` — create.
- `supabase/migrations/20261106120000_match_documents.sql` — create.
- `CLAUDE.md` — edit — tick T07–T11 (T12 is the owner's), the project log, and the note that the schema exposure is done.
- `AGENTS.md` — edit — §12: replace the `ef_search` VERIFY with the measured result.

## Requirements

1. The loader never reports a `#` inside a code fence as a heading. Indented fences count as fences.
2. Every chunk carries `chunk_key`, `heading_path` (title first), `anchor` and `source_url` (including `#anchor` when it isn't empty), plus `token_count` from `cl100k_base`.
3. No chunk spans two headings. No chunk exceeds 800 tokens. Consecutive chunks of a split section overlap by about 15%.
4. A second `npm run ingest -- --yes` straight after the first plans **0 files**, makes 0 embedding calls and costs $0.
5. Every embedding call produces exactly one `model_calls` row plus one JSONL line, priced from `lib/cost`.
6. `match_documents` is callable only by `service_role`. The security advisor shows no new warnings beyond the existing "RLS enabled, no policy" INFO notes.
7. `npm test` stays offline. Fixtures are small inline MDX strings, never the real corpus.

## Security and data safety

- **Corpus:** public, Apache-2.0, pinned. Raw files stay in the gitignored `corpus/` and are never committed. The `chunks` table holds excerpts, and the UI will attribute them (T01).
- **Keys:** `OPENAI_API_KEY` and `SUPABASE_SECRET_KEY` are read only by the scripts, from `.env.local`.
- **Network:** `corpus:check-anchors` fetches public pages only, sequentially, with a delay between requests.
- **Database:** the migration is additive. The deletes in ingest touch only `citedesk` rows for files that left the corpus.

## Cost impact

- **First full ingest:** about **$0.01**, aborting above $0.10.
- **Re-runs with no change:** $0.
- **T12's 10 searches:** under $0.0001.

**Total for this task: under $0.02.**

## Acceptance criteria

- [ ] `npm run corpus:fetch` produces 129 `.mdx` files plus the 4 partials at `aa9d04e`.
- [ ] The dry run reports file, chunk and token counts and the cost estimate. The `--yes` run inserts the chunks and reports the actual cost.
- [ ] The chunk count is reported against the 300–1000 target, with min, median and max token counts.
- [ ] The second run plans 0 files and costs $0.
- [ ] `corpus:check-anchors` reports an exact-match rate (target ≥ 95%) and lists every mismatch.
- [ ] `match_documents` returns top-k by similarity through `rpc()`. The `ef_search` 40 vs 50 row counts are recorded.
- [ ] `npm run search "How do I create a partial index?"` shows `database/postgres/indexes` near the top.
- [ ] typecheck, lint, test and build pass.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run corpus:fetch`, then `npm run corpus:check-anchors`
- `npm run ingest` (dry), then `npm run ingest -- --yes`, then `npm run ingest -- --yes` again (expect 0 files)
- Supabase MCP: `apply_migration` (T11), `get_advisors` (security), and the `ef_search` measurement
- `npm run search "…"`

## Manual test steps (T12 ✋, owner)

Run `npm run search "<question>"` for each question below. For each one, note whether a relevant section is in the top 5 and at which rank. These are suggestions; swap any for your own.

1. How do I create a partial index in Postgres?
2. What's the difference between HNSW and IVFFlat indexes?
3. How do I enable the pgvector extension?
4. How do I schedule a recurring job with pg_cron?
5. How can I combine full-text search with semantic search?
6. When should I use the connection pooler instead of a direct connection?
7. How do I write a Postgres function that returns a table?
8. How do I enable row level security on a table?
9. How do I import a CSV file into a table?
10. How do I do an inner join with the Supabase client?

## Results

Built and run 5–6 Nov 2026 on `feat/ingest`. **Spend: $0.00423** for the ingest, plus about $0.000001 for one search.

**Corpus (`corpus:fetch`):** 129 guide files and the partials folder at `aa9d04e`, in about 2 s. A re-run is a no-op.

**Loader (T07):** an anchor check against the live pages.
- The first run matched **96.8% (969/1001)**. The 32 misses taught us three things the code we read hadn't:
  - the site **drops underscores** (`http_get` → `httpget`);
  - inline code touching punctuation is **space-padded** (`(`vector_l2_ops`)` → `--vectorl2ops-`);
  - **headings inside tabs, accordions and admonitions get no id**.
- One of the misses was our own bug: `_l2_` was read as italics.
- After the fixes: **100% (997/997)**.

**Chunker (T08), a decision made mid-task:** the dry run showed strict one-section chunks give **1,161 chunks** (median 112, min 5), over T01's 1,000. "500–800 tokens" and "never across a heading" can't both hold on these docs. A free simulation compared the rules, and the owner chose **merging sub-sections up to 800 tokens**. Result:
- **835 chunks**, 797 distinct `chunk_key`s;
- tokens: min 10, median 166, p90 623, max 800, with **0 above 800**;
- 713 below 500. That floor is unreachable under any heading-respecting rule.

**Embedder and ingest (T09, T10):**
- The dry-run estimate and the API's reported usage were **both 211,482 tokens**, because the cl100k count is exact. 9 batched calls, $0.00422964, no failures.
- 9 `model_calls` rows match 9 JSONL lines. All vectors are 1536-dim. 129 sources, 0 half-written.
- **Re-run: 0 files planned, $0.**

**T11, `match_documents`:**
- The HNSW (cosine) index is used, and EXPLAIN shows an index scan.
- **The `ef_search` VERIFY is closed: `LIMIT 50` returned 40 rows at the default `ef_search` 40, and 50 at `ef_search` 50.** `match_documents(…, 50)` returns 50, because it raises `ef_search` itself.
- Only `service_role` can execute it. The security advisor shows only the six intended "RLS enabled, no policy" INFO notes.

**First search:** "How do I create a partial index?" put `indexes#partial-indexes` at rank 1 with similarity 0.684, against 0.481 for rank 2. Supabase's 0.78 example threshold would have refused that correct answer, which is a first data point for T33.

**Checks:** typecheck, lint, 78 tests and build pass.

**Still open:**
- T12: the owner's 10 by-hand searches.
- Whether larger chunks help recall: an ablation once the T20 labels exist (open decision 2).
