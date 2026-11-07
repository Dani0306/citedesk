# 011 — Phase 9: deploy and ship (T43–T48)

**Status:** draft
**Branch:** `feat/ship` (from `main` after PR #9)
**Week:** 6 (build guide Phase 9)

## Goal

CiteDesk gets a public home and the documents a reviewer reads:

- **T43:** a Vercel deployment, with a smoke test you can point at any URL.
- **T44:** clicking a citation highlights the passage's closest wording to the sentence that cited it.
- **T45:** a README with an architecture diagram, the generated ablation, diagnosis and caching blocks, how to run it, and dated prior art.
- **T46:** a case-study draft in the repo. I don't publish it.
- **T47:** per your answer below.
- **T48:** an honest status of the six done-criteria, not a green tick.

**Scope slip, stated up front.** The six done-criteria can't all be met in this phase:

- The ablation, diagnosis and judge numbers wait on your hand work (T20: 40 questions, T33: 10 unanswerable questions, T35: 30 labels).
- The case study is published by you on danielcolorado.dev.
- The eval gate's baseline waits on T22.

Everything below renders those as "Pending" rather than inventing a number, and T48 lists exactly what's missing.

## Docs read

- **Vercel, "Functions limits" (read 6 Nov):** on Hobby, `maxDuration` default and maximum are **300 s**, memory is 2 GB / 1 vCPU, and the request body limit is 4.5 MB. Our routes use 30 s and 60 s, which fit.
- **Vercel, "Hobby plan" (read 6 Nov):** Hobby is **non-commercial, personal use only**, which a portfolio demo is. It includes 1,000,000 invocations, 100 GB of bandwidth and 4 CPU-hours. Past a limit, you wait 30 days. There's no surprise bill.
- **Vercel, "Node.js versions" (read 6 Nov):** the default for a new project is **26.x**, alongside 24.x and 22.x. `engines.node` in `package.json` overrides the dashboard setting. We develop and run CI on 24, and Langfuse's integration needs ≥ 22, so I pin `"24.x"`.
- **`node_modules/next/dist/docs/…/generate-metadata.md` → `robots`:**
  - `robots: { index: false, follow: false }` renders `<meta name="robots" content="noindex, nofollow">`;
  - nested metadata fields are merged shallowly, so a root-layout `robots` applies to every route that doesn't define its own.
- **Vercel CLI 41.4.1 (installed, logged in as `dani0306`):** `vercel env add NAME production --sensitive` stores a secret that can't be read back, and `vercel git connect` links the GitHub repo. The account already has three projects, `portfolio` (danielcolorado.dev), `forestmr` and `classly`, so CiteDesk would be a fourth.
- **GitHub (checked 6 Nov):** the repo is already **public**, which covers done-criterion 2. It has **no LICENSE file**, so by default it's all rights reserved. That's your call (see "Needs your attention").
- **`CLAUDE.md` → Prior art and "Positioning":** the competitor facts already read on 2 Nov, all vendor-claimed. The README may use them only if they are linked, dated and marked as vendor-claimed.

## Code inspected

- `package.json`: no `engines`. `.gitignore`: `.vercel` is already ignored. `next.config.ts`: `cacheComponents: true`.
- `app/layout.tsx`: metadata without `robots`, and no `metadataBase`.
- `app/_landing/ui.tsx` + `nav.tsx`, `hero.tsx`, `cta.tsx`: `DemoButton` is **disabled, "Opens after deploy"**. `hero.tsx:54` says "In the lab · not deployed yet", and `footer.tsx` has an "In the lab" badge.
- `app/demo/chat.tsx`, `answer.tsx`, `sources.tsx`, `answer-markdown.ts`:
  - clicking `[n]` calls `onCite(n)`, which highlights and focuses card `n`;
  - the source cards render only the ~240-character **snippet**, but the full passage already arrives in the `data-passage` part (`content`);
  - `parseInline` yields the sentence's inline parts, which contain the marker.
- `lib/answer/citations.ts`: `splitSentences` is a pure, client-safe sentence splitter.
- `README.md`: has the `ablation` and `diagnosis` blocks, no diagram, no usage, no prior art. `evals/runs/` holds the two committed T38 cache run files.
- **CI:** `ci.yml` builds without any secrets and passes, so the production build needs none either.

## Decisions and assumptions

### Order

1. Build the pre-deploy hardening and T44.
2. **Stop and ask again** before anything touches Vercel. Approving this prompt approves the *building*; creating a project, setting secrets and publishing each need their own yes, with the exact commands shown.
3. Deploy, smoke-test live, then write the README with the real URL.

### Pre-deploy hardening (T43)

- **`engines.node: "24.x"`** in `package.json`.
- **`robots: { index: false, follow: false }` in the root layout** until T46. The project stays "in the lab", so it shouldn't be indexed or linked from the portfolio yet. T46's publication removes this line, and I'll list that in the hand-off.
- **The landing's "Try the demo" button becomes a real link to `/demo`.**
  - The "Opens after deploy" caption goes.
  - The hero badge reads "In the lab · demo live" only when the deploy is real; I'll make it a single constant so it can't drift.
  - If you choose not to deploy now, this change waits.
- **A logging notice on `/demo` and `/playground`:** "Questions are stored to measure and debug this demo, and sent to a tracing service. No account, no tracking cookies. Don't enter personal or company data." This is accurate today: `query_log` stores the text, Langfuse traces carry it, and the app sets no cookies.
- **`scripts/smoke-live.ts` + `npm run smoke:live -- --url=<base>`, with a tested pure checker (`lib/answer/stream-check.ts`).** It runs against any URL, local or live:
  1. `GET /` and `GET /demo` and `GET /playground` return 200, and the noindex meta is present;
  2. a bad body to `/api/chat` gets 400;
  3. a sample answerable question streams in the right order: `start`, every `source-url` and `data-passage`, the first text delta only after the last source, `data-citations` last, `invalid` empty;
  4. the TOTP sample question ends in `data-refusal` with no text deltas beyond "I don't know.";
  5. the page's `og:image` URL is absolute and returns an image.
  
  It exits 1 on any failure. A run costs about $0.0004 and logs one answer toward the daily cap.

### T44: the highlight (🎓)

- **What it does:** clicking `[n]` still highlights and focuses card `n`. The card now expands to the **full passage**, with the span of text that **best matches the sentence you clicked** marked. Cards that aren't active stay collapsed to the snippet.
- **How the match is chosen, `lib/answer/highlight.ts`, pure and tested:**
  - The passage is split into units: a sentence, a list item, or one code block.
  - Both sides are lowercased and tokenised, with identifiers like `create_index` kept whole and stopwords and one-character tokens dropped.
  - Each unit's score is the share of the claim's tokens it contains, weighted by token length so `index` counts for more than `is`.
  - It highlights the best unit and any other unit scoring at least 80% of it, up to two.
  - **Below a minimum score nothing is highlighted**, and the card says "No single sentence matches closely; the whole passage is the source." It never marks a weak match as if it were evidence.
- **Which sentence is "clicked":** `AnswerBody` passes `onCite(n, claim)`, where `claim` is the plain text of the inline run in that paragraph or list item before the marker, back to the previous marker or the start. Sentences end in markers (rule 2 of the answer prompt), so that run is the sentence. Grouped markers like `[1][3]` share one claim. The playground ignores the extra argument.
- **The label is honest:** the card's heading says "Closest wording to the sentence you clicked", and the screen-reader text says "best match by shared words". It's a pointer, not a proof; whether the passage actually *supports* the sentence is the judge's job (T36).
- **Rejected: asking the model to quote its supporting span.** It would change the answer prompt, so every measurement, cache break-even and future baseline would need a re-run, and it spends output tokens on every answer. Code could verify a quote is a substring of the passage, but not that it supports the sentence.
- **Also rejected: scoring each passage sentence with embeddings.** That's a model call per click, for a marker the user can already read.
- **Out of scope:** highlighting inside `/playground`, which keeps its row highlight.

### T43: the deploy (asked again before it happens)

- **Project:** `citedesk`, under `dani0306's projects`, on **Hobby**. The URL would be `citedesk.vercel.app` if free (otherwise Vercel suggests another). A custom domain such as `citedesk.danielcolorado.dev` is optional and stays your call.
- **Production environment variables** (set through stdin, never printed; secrets with `--sensitive`): `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`, `CITEDESK_DAILY_ANSWER_CAP=200`, `CITEDESK_DAILY_RERANK_CAP=50`.
  - `CITEDESK_REFUSAL_THRESHOLD` stays unset, so the provisional 0.60 applies and is logged as such.
  - **No Preview environment variables**: previews build (the build needs none) but their API routes can't call anything.
- **GitHub link:** `vercel git connect`, so a merge to `main` deploys. The first deploy is by CLI so we get the URL immediately.
- **The kill switch:** setting `CITEDESK_DAILY_ANSWER_CAP=0` and redeploying turns the demo into the cap message. `vercel remove citedesk` deletes the project. Both go into `AGENTS.md`.
- **Worst-case spend with both caps full:** 200 answers (≈ $0.06) plus 50 reranks (≈ $0.08) is about **$0.14 a day, ≈ $4 a month**, inside the project's $4–8 budget. Langfuse and Vercel are free at this volume.
- **Known limitation, stated in the README:** the caps are global. One person can use up a day's budget, and then the demo shows the cap message until 00:00 UTC. A per-visitor rate limit would need a new service (for example Upstash), which would need your approval, so it's a post-deploy stretch.

### T45: README

- **Structure:**
  1. one-paragraph pitch and status;
  2. the live demo link (after the deploy);
  3. the **architecture diagram**, Mermaid: ingest → chunk → embed → pgvector + `fts` → retrieve (vector ‖ keyword → RRF) → gate → rerank → answer → cite and validate → `query_log`, with evals reading the same code;
  4. the three generated evidence blocks;
  5. "Decisions and what I measured", short bullets with the rejected alternative each;
  6. run it yourself;
  7. prior art;
  8. attribution.
- **A new generated block, `<!-- cache:start/end -->`,** rendered by `eval:report` from the T38 run files. These are the only real measured numbers we have today: U / R / O per config, the 31% break-even, and **n = 4 questions per pass, stated in the block**. `--check` covers it like the others.
- **The diagnosis block also renders the judge's confusion matrix** and its disagreement counts, once a qualifying judge run exists.
- **Prior art:** kapa.ai, Inkeep, Algolia Ask AI and Mintlify, each linked, dated 2 Nov 2026 and marked "vendor-claimed", with no claim about our relative quality.
- **The diagram is verified**, not eyeballed: I parse it with Mermaid itself in headless Chrome and report errors, because GitHub shows a broken diagram as an error box.

### T46: case-study draft

- **`docs/case-study.md`,** written for a hiring manager: the problem, the decisions with their rejected alternatives, and what the measurements showed so far. Examples:
  - `ef_search` silently returning 40 of 50 rows;
  - 0 of 835 chunks matching an AND query for sentence-length questions;
  - the pg_cron stub page producing a confident answer from model memory;
  - paraphrases scoring below the refusal threshold;
  - the caching break-even.
- **Its results section is generated text pointing at the README blocks and says "Pending"** where numbers don't exist yet.
- It's a draft **in this repo only**. I don't touch the `portfolio` project, publish anything, or remove the noindex. Moving the project out of "In the lab" is your step, and I'll list the three lines that change.

### T47 and T48

- **T47:** depends on your answer. If the video stays, I write `docs/demo-script.md` (a timed 90-second shot list with the exact clicks, using the sample chips, ending on a citation highlight and an honest "I don't know"). If it goes, I remove it from the done-criteria and the build order.
- **T48:** a status table in `CLAUDE.md` with evidence for each of the six criteria, and what's blocking each. It says "Not done" wherever that's the truth.

## What this teaches

- **🎓 Evidence you can point at (T44).** A click handler that highlights a passage looks like proof, but a highlight chosen by shared words only says "this is the closest wording", and a highlight chosen by a model only says "the model claims this". The product shows the first, labels it for what it is, and leaves "does it support the claim?" to the calibrated judge. Marking a weak match as a source would be a small lie the interface tells every time.
- **Cost control is a deploy feature.** A public endpoint that spends money needs a ceiling before it needs a domain: the caps, the 2,000-character limit, single-turn requests and a documented kill switch are what let you leave it running.

## Files to touch

- `package.json` — edit — `engines`; the `smoke:live` script.
- `app/layout.tsx` — edit — `robots`. `app/_landing/ui.tsx`, `hero.tsx` (+ `evidence-data` untouched) — edit — the demo link and badge.
- `app/demo/page.tsx`, `app/playground/page.tsx` — edit — the logging notice.
- `lib/answer/highlight.ts` + test — create. `app/demo/answer-markdown.ts` + test, `answer.tsx`, `sources.tsx`, `chat.tsx` — edit — the claim passed to `onCite`, the expanded passage with a mark.
- `lib/answer/stream-check.ts` + test, `scripts/smoke-live.ts` — create.
- `evals/report.ts`, `scripts/eval-report.ts`, `lib/evidence.ts` (+ tests) — edit — the cache block, the confusion matrix.
- `README.md` — rewrite — structure above. `docs/case-study.md` — create. `docs/demo-script.md` — create (only if T47 stays).
- `AGENTS.md` (§12 deploy facts, the kill switch), `CLAUDE.md` (checklist, status table, log) — edit.

## Requirements

1. `highlight.ts`: tested on a real passage, the partial-index section, with its true claim and with an unrelated claim. It picks the right sentence for the first, highlights nothing for the second, keeps code blocks whole, and is deterministic.
2. A click on `[n]` highlights card `n`, expands its full passage with exactly the matched unit marked (or the "no single sentence" note), and gives it focus. The other cards stay collapsed. It's keyboard-operable, and the mark is never the only signal (it carries an underline and a visually hidden label).
3. `stream-check.ts` is tested on a correct stream, sources-after-text, a missing `data-citations`, an invalid marker, and a refusal that streamed an answer.
4. `smoke:live` passes locally before anything is deployed.
5. The README's generated blocks are produced by `eval:report`, and `--check` fails on a hand edit of any of the three. The Mermaid diagram parses.
6. `npm test` stays network-free. No secret appears in any file, log or command output.

## Security and data safety

- **Secrets:** they travel from `.env.local` to Vercel over stdin (the same way as the GitHub secrets), `--sensitive` where supported, and are never printed or committed.
- **A public endpoint:** protected by the daily caps, the length limit and single-turn requests; the kill switch is documented. The service-role key lives only in Vercel's production environment.
- **The corpus is public** (Supabase docs, Apache-2.0, attributed on the page). Visitors' questions are stored and traced; the notice says so, and nothing from Third Way Health or any client is involved.
- **No SEO until T46:** noindex on every page.

## Cost impact

- **This task:** the live smoke runs (about 3, ≈ $0.0012), plus a few demo clicks to check the highlight (≈ $0.002). **≈ $0.004 total.**
- **Running cost afterwards:** Vercel Hobby and Langfuse free; model spend bounded at about $0.14/day by the caps, and far lower in practice.

## Acceptance criteria

- [ ] T44: the highlight works in headless Chrome at 390 and 1280 px, with the tested matcher.
- [ ] T43 (code): `smoke:live` passes locally. **The deploy itself waits for your second yes.**
- [ ] T43 (deploy, after your yes): live smoke passes against the Vercel URL, a live question appears in `query_log` and as a Langfuse trace with environment `production`, and the page head shows an absolute `og:image`.
- [ ] T45: the README renders its three generated blocks, the diagram parses, and `eval:report --check` passes.
- [ ] T46: the draft exists and says "Pending" wherever numbers don't.
- [ ] T47: per your answer.
- [ ] T48: the status table lists all six criteria with their real state.
- [ ] Typecheck, lint, tests, build and CI pass.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run eval:report -- --check`
- `npm run smoke:live -- --url=http://localhost:3000`, then against the live URL
- Headless Chrome: the highlight at 390 and 1280 px

## Manual test steps

1. Open `/demo`, ask "How do I create a partial index?", click `[1]`: card 1 expands, and the sentence about a `where` clause is marked.
2. Ask the TOTP question: the refusal card appears, and nothing is marked.
3. After the deploy: open the live URL on your phone, ask a sample question, and read the logging notice.
4. Read `docs/case-study.md` and tell me what's wrong; it's yours to publish.

## Results

Filled in after the work.
