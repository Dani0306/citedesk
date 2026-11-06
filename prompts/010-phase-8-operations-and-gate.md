# 010 — Phase 8: operations and the regression gate (T38–T42)

**Status:** done (T38, T39, T41, T42; T40 gate and smoke); `evals/baseline.json` waits on T22
**Branch:** `feat/ops-gate` (from `main` after PR #8)
**Week:** 5 (build guide Phase 8)

## Goal

- **T38:** prompt caching is a measured, configurable choice rather than an accident, with a run file stating the break-even.
- **T39:** every model call is traced to Langfuse through the AI SDK 7 telemetry path.
- **T40:** `eval:baseline`, `eval:gate` (the 2-point rule) and `eval:smoke` (retrieval only) exist. The baseline file itself is committed only once real runs exist.
- **T41:** a GitHub workflow runs lint, typecheck and tests on every push and PR, the smoke gate on push, and the full gate on PRs to `main`. It skips cleanly without secrets.
- **T42:** a public `/playground` shows retrieval's working: each candidate's vector, keyword, fused and rerank positions, what was sent to the model and what got cited.

**Scope slip, stated up front.** T40's `evals/baseline.json` must come from full-set runs (40 questions), and T20 isn't done. I build and test the gate and smoke, and the baseline is committed, in its own commit, after T22 and the ablation runs.

## Docs read

- **`node_modules/@ai-sdk/openai/docs/03-openai.mdx` → Prompt Caching (provider 4.0.107):**
  - "In `'implicit'` mode, OpenAI places an automatic breakpoint on the **latest message**." That explains the measurement from prompts 005 and 008: our whole user message (sources plus question) is cache-written on every call.
  - "In `'explicit'` mode, only marked content blocks are eligible for caching; **a request without any explicit breakpoint does not use prompt caching**."
  - Breakpoints need a prefix of at least 1,024 tokens. Our static instructions are about 350 tokens, so there's no shared prefix worth marking across different questions.
  - `promptCacheOptions.ttl`: `30m` is the default; `12h` is billed at 2.5×.
- **`lib/cost/pricing.ts` (read 5 Nov):** luna input $0.10, cached input $0.01, cache write $0.125 per 1M. **This closes the cache-write VERIFY** in `AGENTS.md` §12: writes cost 1.25× input, and the cost maths matched the live calls exactly (prompts 005 and 008).
- **`node_modules/ai/docs/03-ai-sdk-core/60-telemetry.mdx`:**
  - `registerTelemetry(integration)` once at startup;
  - in Next.js it goes in `instrumentation.ts`'s `register()`;
  - calls emit by default; `telemetry: { functionId }` names them, and `recordInputs` / `recordOutputs` default to true.
- **Langfuse, "Vercel AI SDK" integration (fetched 6 Nov):** the AI SDK 7 path is `registerTelemetry(new LangfuseVercelAiSdkIntegration())` from `@langfuse/vercel-ai-sdk` (Node ≥ 22), plus a `LangfuseSpanProcessor` from `@langfuse/otel` on an OTel tracer provider. In serverless, flush with `after(() => spanProcessor.forceFlush())`. The env vars are `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and `LANGFUSE_BASE_URL`, and all three are already set in `.env.local`.
- **Langfuse pricing (fetched 6 Nov):** the Hobby (free) plan has **50k units/month, 30 days of data access and 2 users**. This closes the VERIFY in `CLAUDE.md`'s cost model. A demo answer is 2–3 observations, so 50k units is roughly 15,000 questions a month.
- **npm (6 Nov):**
  - `@langfuse/vercel-ai-sdk` 6.1.1 (MIT; it depends on `@ai-sdk/otel ^1.0.44` and peers on `ai >=7 <8`) and `@langfuse/otel` 6.1.1 (MIT; it peers on `@opentelemetry/exporter-trace-otlp-http >=0.202 <0.300`);
  - `@ai-sdk/otel` **pins `ai` exactly**: 1.0.164 → `ai` 7.0.164. **1.0.161 → `ai` 7.0.161, our version**, so I pin 1.0.161 to avoid a second copy of `ai`;
  - `@opentelemetry/sdk-trace-node` 2.12.0 (Apache-2.0; its peer is api `<1.10`), and `@opentelemetry/api` 1.9.1 (the version `@ai-sdk/otel` uses);
  - **rejected: `@opentelemetry/sdk-node` 0.301**, which is outside `@langfuse/otel`'s `<0.300` peer range and pulls in Prometheus, Zipkin and B3.
- **PaperTrail `.github/workflows/eval-gate.yml`:**
  - it skips with a notice when the secret is missing;
  - actions are pinned by SHA (`checkout` v7.0.1 `3d3c42e…`, `setup-node` v7.1.0 `949feb2…`, `upload-artifact` v7.0.2 `cf430e0…`, all checked against their tags today with `gh api`);
  - it has concurrency cancel, a spend limit, and uploads the run file.

## Code inspected

- `lib/answer/answer.ts`, `stream.ts`, `lib/retrieve/rerank.ts`, `evals/judge.ts`: every model call goes through `recordCall`, with `providerOptions.openai.store: false` and no cache options.
- `evals/schema.ts`, `report.ts`, `lib/evidence.ts`: the run files and the "full set only" evidence rule (`MIN_EVIDENCE_QUESTIONS` 40).
- `scripts/eval-shared.ts`: the shared runner helpers. `.gitignore` already ignores `evals/runs/ci-*.json`.
- There's **no `.github/` in this repo** and no Actions secrets (`gh secret list` is empty).
- **The gate needs more than `OPENAI_API_KEY`.** Retrieval reads `citedesk.chunks` through `match_documents`, so CI also needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. `AGENTS.md` §12 says only the OpenAI key; I'll correct it.

## Decisions and assumptions

### T38: caching as a measured choice (🎓)

- `AnswerConfig.cacheMode: "implicit" | "off"`. `off` sends `promptCacheOptions: { mode: "explicit" }` with no breakpoints, which per the docs means no caching at all. The same option goes on the rerank call and is recorded in `query_log.config` and in run files.
- **Measurement: `npm run eval:cache` (`evals/cache.ts`).** Four sample questions, all answerable, run on `hybrid + rerank` in three passes:
  1. implicit, first ask (each question unique);
  2. implicit, exact repeats within 30 minutes;
  3. off.
- **From the measured costs:**
  - U = cost per question under implicit when the question is unique;
  - R = the same under implicit for an exact repeat;
  - O = the cost with caching off.
- **Break-even repeat share** r* = (U − O) / (U − R). With a share r of exact repeats, implicit costs (1 − r)·U + r·R per question, against O for off. **Implicit wins when r > r\***. By the price table alone, r* ≈ 0.22.
- **Decision rule:** the demo route keeps `implicit` if the measured r* is below the repeat share the demo's sample chips make likely, assumed ≥ 0.3 until deploy traffic measures it. `query_log` makes that share measurable after deploy: the share of answer calls with `cached_input_tokens > 0`.
- Eval runners take `--cache=off|implicit` (default implicit, as the product runs).
- The run file is `evals/runs/YYYY-MM-DD-cache.json` (`kind: "cache"`, no `eval_runs` row).
- **The README claims only what this file shows.** A README line is T45's job.
- **Rejected:** padding the static instructions past 1,024 tokens to make them cacheable. It saves about $0.00003 per answer and makes every uncached call longer. Also rejected: the 12-hour TTL, at 2.5× write cost, for a demo.

### T39: Langfuse tracing (🎓)

- **New dependencies, pinned exactly (your approval is asked below):** `@ai-sdk/otel` 1.0.161, `@langfuse/vercel-ai-sdk` 6.1.1, `@langfuse/otel` 6.1.1, `@opentelemetry/api` 1.9.1 and `@opentelemetry/sdk-trace-node` 2.12.0. `@langfuse/otel`'s peers resolve from the lockfile within its ranges (`exporter-trace-otlp-http` / `otlp-exporter-base` 0.223.0, `sdk-trace-base` 2.12.0).
- **`lib/telemetry.ts`, `startTracing()`:** a no-op unless all three `LANGFUSE_*` variables are set, matching `.env.example`'s promise. It registers a `NodeTracerProvider` with a `LangfuseSpanProcessor`, then `registerTelemetry(new LangfuseVercelAiSdkIntegration())`, and returns `flush()`.
- **App:** `instrumentation.ts` calls it under `NEXT_RUNTIME === "nodejs"`, and `/api/chat` flushes with `after()`.
- **Scripts:** `ask`, `search` and every `eval:*` runner start it and flush in `finally`, inside the shared `main()`.
- **Each call gets a `functionId`:** `citedesk.embed_query`, `citedesk.answer`, `citedesk.rerank` or `citedesk.judge`. Inputs and outputs are recorded; they're public docs plus questions, see Security.
- **`model_calls` stays the source of truth for cost.** Langfuse is for looking at traces, never for numbers in the README.

### T40: baseline, gate, smoke

- **`evals/gate.ts` (pure, tested):**
  - **Retrieval headline metrics: recall@5 and MRR.** The gate fails when either drops **more than 2 points** (0.02) below the baseline for the same config, or when the run's `questionsHash` differs from the baseline's (regenerate the baseline on purpose, in its own commit).
  - **Generation:** fails on any hallucinated citation (> 0), or on a correct-refusal or false-refusal rate more than 2 points worse.
  - It returns the per-metric verdicts, and the runner prints them.
- **`npm run eval:baseline -- --retrieval=<files…> [--generation=<file>]`** writes `evals/baseline.json`. It accepts only runs on the full current set (the same rule as the evidence), and records each run's file, metrics and git SHA.
- **`npm run eval:gate -- --run=<file>`:** with no baseline yet it exits 0 with a notice. It never pretends to gate.
- **`npm run eval:smoke`:** a retrieval-only run on `vector`, one embedding per question (about $0.00001 for 40), over the questions tagged `smoke` (or the first 10 answerable if none are tagged). It writes `evals/runs/ci-smoke.json` and gates its subset metrics against the baseline's per-question results for the same ids. Without a baseline, it reports and exits 0.

### T41: CI

- **`.github/workflows/ci.yml`, free, on every push and PR:** `npm ci`, lint, typecheck and test (no secrets; `npm test` never touches the network).
- **`.github/workflows/eval-gate.yml`:**
  - On **push**: `eval:smoke`, then `eval:gate`.
  - On **PRs to `main`** (only when `lib/`, `evals/`, `scripts/eval*` or `lib/models.ts` change) and by hand: `eval:retrieval` for all three configs, then `eval:generation` (vector), each gated, with **a total spend limit of $1** passed as `--max-usd`.
  - **It skips with a notice** when `OPENAI_API_KEY`, `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is absent, including on fork PRs.
  - Actions are SHA-pinned as in PaperTrail, `permissions: contents: read`, and runs are grouped with `cancel-in-progress`. Run files are uploaded as artifacts (30 days).
  - CI runs log their calls to JSONL only (`CITEDESK_LOG_DB=0`), so CI doesn't write `model_calls` rows into the demo's daily cap count.
  - The judge doesn't run in CI: its labels are tied to one labelled run file, so calibration stays an offline, deliberate step.
- **Adding the secrets is your decision** (asked below).

### T42: playground

- **`/playground` + `POST /api/playground` (JSON, not streamed).** The body is `{ question, retrieval: "vector" | "hybrid", rerank: boolean }`. The route runs the same `prepareAnswer` → answer → `finishAnswer`, plus the **pre-rerank pool**: `prepareAnswer` gains a `pool` field, the fused top 20 before rerank.
- **The response:**
  - the gate: top vector similarity, the threshold, refused or not and why;
  - per candidate: chunk key, title, URL, similarity, vector rank, keyword rank, fused rank, rerank position, whether it was **sent to the model** (as `[n]`), and **cited**;
  - the answer with its citation check; rerank status; cost and latency.
- **Caps:**
  - every playground answer counts against the existing daily answer cap;
  - **reranks get their own cap, `CITEDESK_DAILY_RERANK_CAP` (default 50, about $0.08/day worst case)**, counted from `model_calls`. When it's reached, the toggle is refused with a message, not an error;
  - one `query_log` row per question, as for chat.
- **UI:**
  - the question box and the two toggles;
  - a gate summary;
  - a candidate table (cards below 640 px) with the rank columns side by side, sent/cited badges and links to the section;
  - the answer underneath, rendered with the demo's renderer.
  
  It reuses the `/demo` components and tokens. It's linked from `/demo`; the landing page is untouched.

## What this teaches

- **🎓 Prompt caching, measured (T38).** Caching is prefix-based: a request reuses cached input only when its beginning matches a cached prefix of at least 1,024 tokens. Ours differs per question after about 350 tokens, so only *exact repeats* hit. Implicit mode pays 1.25× to write each new prompt, betting it comes back; that bet pays only above a repeat share r*, which the run file measures.

  Rejected: always-on caching on faith (what we had), and padding the prompt to manufacture a shared prefix.
- **🎓 Tracing (T39).** `model_calls` answers "what did it cost". A trace answers "what did the model actually see and say, in what order, and how long did each step take": the thing you open when an answer looks wrong. They're kept separate on purpose: numbers come from our own table and tests; traces are for looking.

## Files to touch

- `lib/answer/answer.ts`, `stream.ts` (+ tests), `lib/retrieve/rerank.ts`, `evals/judge.ts` — edit — `cacheMode`, `functionId`, and `pool`.
- `evals/cache.ts` + test, `scripts/eval-cache.ts` — create — T38.
- `lib/telemetry.ts`, `instrumentation.ts` — create. `app/api/chat/route.ts`, `scripts/eval-shared.ts`, `scripts/ask.ts`, `scripts/search.ts` — edit — T39.
- `evals/gate.ts` + test, `evals/baseline.ts`, `scripts/eval-baseline.ts`, `scripts/eval-gate.ts`, `scripts/eval-smoke.ts` — create — T40.
- `lib/calls/sinks.ts` — edit — `CITEDESK_LOG_DB=0` makes a script log to JSONL only.
- `.github/workflows/ci.yml`, `.github/workflows/eval-gate.yml` — create — T41.
- `app/api/playground/route.ts`, `app/playground/*`, `lib/answer/cap.ts` + `lib/db/answer-cap.ts` (the rerank cap) — create / edit — T42.
- `.env.example`, `package.json`, `AGENTS.md` (§12 caching VERIFY closed, CI secrets, telemetry), `CLAUDE.md` — edit.

## Requirements

1. `cacheMode: "off"` sends explicit mode with no breakpoint, and a live call shows `cache_write_tokens` 0. `implicit` is unchanged.
2. `eval:cache` writes U, R, O and r* from measured `model_calls`, never from the price table.
3. With no `LANGFUSE_*` variables set, tracing is fully off (no network, no error). With them set, a live `npm run ask` produces a Langfuse trace with the answer generation in it, checked through the Langfuse MCP.
4. **The gate's unit tests:**
   - a 2.0-point drop passes and a 2.1-point drop fails;
   - a hash mismatch fails;
   - a hallucinated citation fails;
   - no baseline → skip.
   
   Smoke selects the tagged subset and compares per-question subset metrics.
5. The workflows are valid YAML with SHA-pinned actions, skip without secrets, cap spend, and upload run files. `npm test` stays network-free.
6. The playground shows every candidate's ranks across the stages and marks sent and cited correctly. It respects both caps and logs `query_log`.

## Security and data safety

- **Traces send prompts and outputs to Langfuse Cloud (US region).** That's public Supabase docs plus visitors' questions to the demo. No keys, no Third Way Health or client data. The demo page will say questions are logged, which T43 adds to the page copy.
- **CI secrets.** Adding `OPENAI_API_KEY`, `SUPABASE_URL` and `SUPABASE_SECRET_KEY` to the repo gives Actions the service-role key to CiteDesk's own project. Workflows run with `contents: read`, fork PRs get no secrets, and the eval runs only read chunks and write JSONL.
- **The playground is public:** it has the answer cap, a rerank cap, Zod input and the 2,000-character limit, like `/api/chat`.

## Cost impact

- **T38 measurement:** 4 questions × 3 passes on `hybrid + rerank` ≈ $0.02.
- **T39 checks:** 2 `ask` runs ≈ $0.001.
- **T42 checks:** about 4 playground queries, 2 with rerank, ≈ $0.005.
- **CI later, per PR to `main`:** retrieval for 3 configs (≈ $0.07, mostly rerank) plus generation (≈ $0.02), ≈ $0.09 a PR. Smoke costs ≈ $0.00001 a push.
- **This task:** ≈ $0.03, approved with this prompt.

## Acceptance criteria

- [ ] T38: `cacheMode` is tested. The `eval:cache` run file has measured U, R, O and r*, and the decision is recorded in `CLAUDE.md` with the numbers.
- [ ] T39: the dependencies are installed and pinned, tracing is off without keys, and a live trace is confirmed in Langfuse.
- [ ] T40: gate, smoke and baseline are tested. **`baseline.json` waits on T22.**
- [ ] T41: both workflows are committed and skip-safe. **The secrets are your call.**
- [ ] T42: the playground works live, with both caps.
- [ ] Typecheck, lint, tests and build pass, and `eval:report --check` passes.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run eval:report -- --check`
- Live: `eval:cache`, a traced `ask`, playground clicks, a `curl` of the playground route

## Manual test steps

1. `npm run ask "How do I create a partial index?"`, then open Langfuse (US). A trace named `citedesk.answer` should appear, with the prompt and the answer.
2. Open `/playground`, ask "When should I pick HNSW over IVFFlat?" with hybrid and rerank on, and read the vector, keyword, fused and rerank columns. The cited rows are marked.
3. Read `evals/runs/<date>-cache.json`: U, R, O and the break-even r*.
4. After T22: `npm run eval:baseline -- --retrieval=evals/runs/<…>.json …`, commit it on its own, then `npm run eval:gate -- --run=<file>`.

## Results

- **Owner decisions (6 Nov):** add the five tracing dependencies, and have me set the three CI secrets with `gh secret set`. They went over stdin, never printed; `gh secret list` shows names only.
- **T38, `npm run eval:cache`** (run files committed in `evals/runs/`):

  | Config | U (first ask, implicit) | R (exact repeat) | O (caching off) | Break-even r* |
  |---|---|---|---|---|
  | hybrid + rerank | $0.001730 | $0.000746 | $0.001426 | 31% |
  | vector | $0.000302 | $0.000120 | $0.000245 | 31% |

  - **Caching off was really off** (0 write tokens): explicit mode with no breakpoint disables caching, as the docs said.
  - **With rerank on, a repeat's *answer* call never hit.** The reranker's order isn't deterministic, so the top 8 and the answer prompt change: 3,123 vs 3,415 tokens for the same question. The rerank call itself hit on 3 of 4 repeats.
  - Caching is best-effort: 1 in 4 exact repeats missed on each config.
  - **Decision:** the demo keeps implicit caching. The sample chips should push the repeat share past 31%, and the worst case (all unique questions) costs about $0.00006 more an answer. `query_log` will measure the real share after the deploy.
- **T39:**
  - The first traced `ask` arrived as **separate** traces (the embedding, and the generation as "invoke_agent gpt-6-luna").
  - Fix: a `traced()` parent span on a `citedesk` tracer, plus a `shouldExportSpan` that keeps Langfuse's default filter and adds that tracer. Without it, the processor would drop our span.
  - Confirmed through the Langfuse MCP: the trace `citedesk.ask` holds the embedding and the generation.
  - Ingestion lag is about a minute, which explained the first empty queries.
- **T40:**
  - the gate's tests pass: 2.0 points passes, 2.1 fails, a hash mismatch fails, a missing config fails, any hallucinated citation fails, and refusal rates are held in the right direction;
  - `eval:gate` with no baseline prints a notice and exits 0;
  - a live `eval:smoke` (3 questions, `CITEDESK_LOG_DB=0`) cost $0.0000012 and wrote the gitignored `ci-smoke.json`.
- **T41:** both workflows parse, and the action SHAs match their tags (checked with `gh api`). The first CI runs happen on push.
- **T42:**
  - `/api/playground` answered "When should I pick HNSW over IVFFlat?" (hybrid + rerank): the reranker put fused #2 and #3 first and fused #1 third, and pulled in #4 and #6;
  - in headless Chrome: 22 rows, 5 cited, a `[1]` click highlighted and focused its row, and 0 px overflow at 390 px.
- **Spend:** ≈ $0.022.
- **Checks:** 227 tests pass; typecheck, lint, build and `eval:report --check` are clean.
