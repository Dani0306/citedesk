# 008 — Phase 6: product surface (T28–T32)

**Status:** draft
**Branch:** `feat/demo-chat` (from `main` after PR #6)
**Week:** 4 (build guide Phase 6; minimum scope 3–6, user-facing)

## Goal

A visitor opens `/demo`, clicks a preloaded sample question or types their own, and sees:

- the retrieved sources appear first;
- the answer streams in with `[n]` markers that are links to the source they cite (and highlight its card);
- or a designed refusal: "I don't know" plus the closest section.

`POST /api/chat` does it server side, with Zod input, the same pipeline as `npm run ask`, citations validated after the stream, and one `query_log` row. A global daily cap counted from `model_calls` protects the budget. There's no login.

## Docs read

- **`node_modules/ai/docs/04-ai-sdk-ui/02-chatbot.mdx` (AI SDK 7.0.161):**
  - `useChat({ transport: new DefaultChatTransport({ api }) })`;
  - render `message.parts`;
  - `status` is `submitted`, `streaming`, `ready` or `error`, with `stop()` and `error`;
  - the route returns `createUIMessageStreamResponse({ stream })`.
- **`node_modules/ai/docs/04-ai-sdk-ui/02-chatbot.mdx` → Sources:** `sendSources` only forwards *provider* sources (for example Perplexity). **Our sources come from our own retrieval, so the route writes them itself.**
- **`node_modules/ai/docs/04-ai-sdk-ui/20-streaming-data.mdx`:**
  - `createUIMessageStream({ execute: ({ writer }) => … })`;
  - `writer.write({ type: 'start' })`;
  - `data-<name>` parts, which are persistent and reconciled by `id`;
  - `toUIMessageStream({ stream, sendStart: false })` to merge a model stream.
  - **Its source example (`type: 'source'`) disagrees with the installed types.**
- **`node_modules/ai/dist/index.d.ts`:**
  - `UIMessageChunk` has `{ type: 'source-url', sourceId, url, title? }` (and `source-document`). **The types win**, and the protocol doc agrees with them.
  - `StreamTextResult` exposes `text`, `totalUsage` and `finishReason` as promises.
- **`node_modules/ai/docs/04-ai-sdk-ui/21-transport.mdx`:** `prepareSendMessagesRequest` shapes the request body.
- **`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`, `…/route-segment-config/maxDuration.md`:**
  - a POST route handler is dynamic and never cached;
  - `export const maxDuration = 30` caps execution on Vercel;
  - the `runtime` default is `nodejs`.

## Code inspected

- **`lib/answer/answer.ts`:**
  - `answerQuestion` runs retrieve → gate → rerank → generate (non-streaming) → validate as one function;
  - the `GenerateFn` dependency returns the whole text.
- **`lib/answer/{prompt,citations,refusal}.ts`:** the prompt, `checkCitations` and `closestSection` are pure, so they're reusable as is.
- **`lib/db/query-log.ts`:** `persistQuery` writes the row, then the buffered calls with `query_id`. **`lib/calls/sinks.ts`:** `memorySink`.
- **`supabase/migrations/…schema.sql`:** a `model_calls_answer_created_at_idx` partial index already exists for the daily cap.
- **`app/_landing/ui.tsx`:** `Container`, the button classes, and `DemoButton`, which is disabled with "Opens after deploy". **`app/globals.css`:** the design tokens (`bg`, `surface`, `card`, `ink`, `ink-2`, `line`, `accent*`) and dark/contrast modes. **`app/_landing/citation-demo.tsx`:** the visual language for `[n]` chips and highlighted cards.
- **`.env.example`:** `CITEDESK_DAILY_ANSWER_CAP=200`.

## Decisions and assumptions

- **Split the pipeline so streaming and non-streaming share one path (`lib/answer/answer.ts`).**
  - `prepareAnswer(question, deps, config)` does retrieve → gate → rerank. It returns either a finished refusal or `{ retrieved, instructions, prompt, … }`.
  - `finishAnswer(prepared, { text, finishReason }, latency)` does the `I don't know.` check and the citation check.
  - `answerQuestion` becomes `prepare → generate → finish`, so the `ask` script and the evals keep working with their tests.
- **The streaming core lives in `lib/answer/stream.ts`, `streamAnswer(question, deps, config, write)`, so it's testable without HTTP.** In order:
  1. `start`;
  2. **one `source-url` part per retrieved chunk** (`sourceId` = the marker number, the URL with its anchor, and the heading path as title), plus a `data-passage` part per source (`n`, `chunkKey`, snippet, content);
  3. the model's text chunks, forwarded as they arrive;
  4. after the stream ends, `data-citations` (`cited`, `invalid`, `uncitedSentences`). On a refusal it's `data-refusal` (reason, closest section) after a short "I don't know." text instead.

  The model's stream is consumed inside `recordCall`, so the answer call is logged with its real usage, or as `api_error` if the stream errors.
- **The route is thin: `app/api/chat/route.ts` (T28 🎓).**
  - It parses `{ question }` with Zod (1–2,000 characters, reusing `Question`).
  - It checks the daily cap, then runs `createUIMessageStream` → `streamAnswer`.
  - At the end it persists `query_log` plus the buffered calls, then writes `finish`.
  - `onError` returns a generic message, so no internals reach the browser.
  - `maxDuration = 30`.
  - **The request is single-turn.** The client sends only the new question (`prepareSendMessagesRequest`), and each question is answered on its own. Follow-ups that depend on earlier turns would need query rewriting, which is a post-deploy stretch item. This also keeps the request body tiny and the validation trivial.
- **T32 daily cap (`lib/answer/cap.ts` + `lib/db/answer-cap.ts`).**
  - It counts `model_calls` rows with `purpose = 'answer'` since 00:00 UTC (`count: 'exact', head: true`, using the existing partial index).
  - At or above `CITEDESK_DAILY_ANSWER_CAP` (200 by default; an invalid value throws at startup), it returns **429** with a plain message.
  - Refusals make no answer call and don't count. Failed calls do count, which is the conservative choice.
  - Worst case at 200 answers is about $0.06/day (luna, vector retrieval). This is not concurrency-safe at the exact boundary (two requests can both pass at 199); that's acceptable for a demo cap.
- **The demo uses `defaultConfig()`: vector retrieval, no rerank, until T26's table decides.** The switch is one line.
- **UI: `/demo`.** It's a server page with one client island, `app/demo/chat.tsx`, using `useChat`. The landing page isn't touched (see the question below).
  - **Answer rendering:** a small Markdown subset renderer (`app/demo/answer-markdown.ts` + `.tsx`) that parses paragraphs, lists, fenced code, inline code and bold into React elements, never HTML strings. `[n]` markers become buttons. It's tested and has no dependency. Rejected: `react-markdown` + `remark-gfm`, two new dependencies for the five constructs a cited answer uses.
  - **Citations (T29):** each `[n]` is a button showing the number, named "Source n: <title>". Clicking it highlights and scrolls to source card n, where the card links to the section anchor. Sources are **visible by default** as a numbered list under the answer, cited ones marked, never in a modal. Invalid markers render as plain text with a "not a retrieved source" tooltip and screen-reader text, so they're never a link.
  - **Passage-level highlighting** (marking the cited sentence inside the passage) is T44.
  - **Refusal (T30):** a designed card. The heading is "I don't know." The line under it depends on the reason: low_score is "The docs I have don't cover this closely enough to answer."; not_in_sources is "The closest sections don't actually answer it."; no_matches is "Nothing is indexed yet." Then the closest section's title, snippet and link, and a reminder of what the corpus covers (Supabase Database and AI guides).
  - **Demo mode (T31):** 4 sample-question chips above the input. Three answer: "How do I create a partial index?", "How do I enable row level security on a table?" and "When should I pick HNSW over IVFFlat?". One refuses: "How do I set up TOTP MFA in Supabase Auth?". Each was checked live in prompts 005/007.
  - **The rest:**
    - Q&A pairs stay in client state only, never stored in the browser.
    - The status line says "Searching the docs…" while submitted.
    - A Stop button cancels a stream.
    - Errors show a retry, and the 429 shows the cap message.
    - `aria-busy` on the answer while streaming, and the finished answer is announced once.
    - Focus rings, disabled states, no colour-only signals, and the layout works down to 360 px.
  - It reuses the landing page's tokens and button classes. There's no component library, and the page keeps the attribution line "Source: Supabase docs (Apache-2.0), commit aa9d04e. Not affiliated with Supabase."

## What this teaches

- **🎓 Streaming, sources first (T28).** The route writes the sources before the first token. So the evidence is on screen while the answer is still being written, and a reader can start checking at once.

  The validation result can only come at the end, because a marker can't be checked until the text is complete. That's why `data-citations` arrives last, and why invalid markers are rendered plainly rather than edited out of a stream that has already been shown.

  Rejected: waiting for the full answer and sending everything at once. It's simpler, but it adds 2–3 s of blank screen, which is exactly what streaming exists to remove.

## Files to touch

- `lib/answer/answer.ts` + test — edit — `prepareAnswer`, `finishAnswer`, with `answerQuestion` on top.
- `lib/answer/stream.ts` + test — create — `streamAnswer`, `openaiStreamGenerate`, the message part order.
- `lib/answer/ui-message.ts` — create — the `CiteMessage` type (data parts: `passage`, `citations`, `refusal`), shared by the server and the client.
- `lib/answer/cap.ts` + test, `lib/db/answer-cap.ts` — create — the cap parsing and the today count.
- `app/api/chat/route.ts` — create.
- `app/demo/page.tsx`, `chat.tsx`, `answer-markdown.ts` + test, `answer.tsx`, `sources.tsx`, `refusal.tsx`, `samples.ts` — create.
- `AGENTS.md` (§12 the stale `type: 'source'` example; §13), `CLAUDE.md` (checklist, log) — edit.

## Requirements

1. **The route rejects bad bodies with 400:** a missing question, an empty one, more than 2,000 characters, or a non-JSON body. Over the cap it returns 429 before any model call. It never puts a stack trace or a key in a response.
2. **Part order on an answer:** `start` → every `source-url` and `data-passage` → text chunks → `data-citations` → `finish`. On a refusal: `start` → short text → `data-refusal` → `finish`, with no answer call.
3. **Exactly one `query_log` row per completed question,** with the calls linked. A failed stream still logs its `model_calls` row (`api_error`).
4. **The renderer:** markers become buttons, invalid markers stay plain text, code blocks and inline code are never parsed for markers, and there's no `dangerouslySetInnerHTML`.
5. **The UI renders `message.parts`, not `content`.** Sources are visible without a click, and every interactive element has a focus ring and a disabled state.
6. `npm test` makes no network calls. The browser never gets a key and never calls a model.

## Security and data safety

- **Keys stay server-side:** the route imports only `server-only` data modules, and no `NEXT_PUBLIC_` variables are added.
- **The public demo spends money:** the daily cap, the 2,000-character limit and single-turn requests (no client-supplied history reaching the model) bound it.
- **Prompt injection from the question:** the question goes in the user message after the sources, the instructions say sources are data, and code validates the citations. The model has no tools.
- **Questions are stored in `query_log`** (server-only, `service_role`) as before. Nothing is stored in the browser.

## Cost impact

- **Per demo answer:** about $0.0003 (vector retrieval, no rerank). A refusal costs about $0.0000003.
- **The cap's worst case:** 200 answers ≈ $0.06/day.
- **This task's live checks:** about 6 questions through the route and the UI, about $0.002, approved with this prompt.

## Acceptance criteria

- [ ] T28: requirements 1–3 are tested in `stream.test.ts` with fakes. A live `curl` of `POST /api/chat` shows the sources before the first text delta, then `data-citations`.
- [ ] T29: the `/demo` answer shows numbered sources, and a `[n]` click highlights its card, which links to the anchor.
- [ ] T30: the TOTP question shows the refusal card with the closest section, and no answer call is logged.
- [ ] T31: the 4 chips work with no login.
- [ ] T32: the cap is tested. A live check with `CITEDESK_DAILY_ANSWER_CAP=0` returns 429 and the UI's cap message.
- [ ] Typecheck, lint, tests and build pass, with a click-through at 390, 768 and 1280 px.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run dev`, then click through `/demo`
- Live: a `curl` of the route, plus SQL on `query_log` and `model_calls`

## Manual test steps

1. Run `npm run dev` and open `http://localhost:3000/demo`.
2. Click "How do I create a partial index?". The sources should appear before the answer text. Click `[1]`: source card 1 should highlight, and its link should open the "Partial indexes" section.
3. Click "How do I set up TOTP MFA in Supabase Auth?". You should get the refusal card: "I don't know." plus the closest section.
4. Type a 2,001-character question. The send button should stay disabled (and the route rejects it anyway).
5. Restart with `CITEDESK_DAILY_ANSWER_CAP=0 npm run dev` and ask anything. You should see "Today's demo limit is used up…".
6. Check at 390 px wide: the sources should stay visible under the answer.

## Results

Filled in after the work.
