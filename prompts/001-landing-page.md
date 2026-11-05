# 001 — Landing page

**Status:** done (visual check pending, see Results)
**Branch:** `feat/landing-page`
**Week:** 1 (not in the T01–T48 build guide; owner request, built from `prompts/landing-page-design.md`)

## Goal

`/` stops being the create-next-app page and becomes an honest landing page for CiteDesk: what it does, a scripted citation demo, the refusal state, how it works, and an Evidence section that shows labelled "pending" states until real run files exist.

## Docs read

- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md` (Next 16.4.4, read 5 Nov 2026) — with `cacheComponents: true`, `fs.readFileSync` and module imports are "predictable values" and are prerendered into the static shell; `await readFile()` inside a component would need `use cache` or `<Suspense>`. So the Evidence loader uses synchronous reads.
- `.../05-config/01-next-config-js/cacheComponents.md` — already enabled with `partialPrefetching: true` in `next.config.ts`; no change needed.
- `.../04-functions/generate-metadata.md` — `themeColor` in `metadata` is deprecated; use the `viewport` export.
- `.../04-functions/generate-viewport.md` — `export const viewport: Viewport = { themeColor }` from `layout.tsx`; supports a light/dark media array.
- `.../01-getting-started/13-fonts.md` — `next/font/google` with `subsets` and a CSS `variable`, as the scaffold already does for Geist Mono.
- `/apple-design` skill (loaded) — mapped onto the sections below.

## Code inspected

- `app/page.tsx` — default create-next-app page using `/next.svg` and `/vercel.svg`; replaced wholesale.
- `app/layout.tsx` — loads Geist and Geist Mono; default title "Create Next App"; uses the generated `LayoutProps<"/">` type.
- `app/globals.css` — Tailwind v4 `@import "tailwindcss"` + `@theme inline`, two colour tokens, and an `Arial` body that overrides Geist.
- `next.config.ts` — `cacheComponents` and `partialPrefetching` on, Tailwind via the Turbopack loader.
- `vitest.config.ts` — includes `**/*.test.ts`, `@` alias to the repo root.
- `public/` — only the five default SVGs, none used after this task.
- Git: `main` has no commits yet, so a feature branch has nothing to branch from (see Needs your attention).

## Decisions and assumptions

The four open questions in the design plan (§7) take its recommendations:

- **Routes:** `/` is the landing. The app will live at `/ask` (T29). "Try the demo" renders as a disabled button labelled "Demo opens after deploy" so it never links to a dead route.
- **Theme:** light and dark via `prefers-color-scheme`, light as the default look.
- **Language:** English only.
- **Corpus:** the sample answer and sources are neutral, fictional "handbook" content, clearly labelled *Sample · scripted, not a live answer*. The footer says "Source docs: not ingested yet" until T01 and T10 are done.

Decisions this prompt adds:

- **No new dependency.** The page has no drag or flick gestures, so springs aren't needed. Motion is CSS only: press feedback, the citation highlight, and the FAQ disclosure. CSS transitions retarget from the current value when interrupted, which is enough for clicks and hovers. Adding `motion` would need owner approval and buys nothing here.
- **No scroll-reveal animation.** The plan listed it, but every way of doing it either hides content for visitors without JavaScript or flashes on load. Motion stays only where it carries meaning (Apple's purpose and utility rules), and that matches the "one idea per viewport" restraint.
- **System font for text, Geist Mono for evidence.** Body and display use the platform system font (SF Pro on Apple devices, with optical sizing and tracking tables included). Geist Sans is dropped, which saves a font download. Geist Mono stays for `[n]` markers, the source panel and table numbers. The Arial override in `globals.css` goes.
- **One accent colour.** A blue in light and dark variants, used only for links, the primary button and the active citation. Everything else is neutral.
- **Evidence is never faked.** `evidence-data.ts` returns `pending` while `evals/runs/` is missing or empty. Once a run file exists, the loader **throws at build time** with a message pointing to T27, until it is wired to the run-file schema from T18/T21. A stale or hand-typed number can't slip onto the page. Rejected alternative: inventing a run-file format now, which T21 would then have to match.
- **No competitor names on the page.** That keeps the "linked, dated, vendor-claimed" rule trivially satisfied.
- **GitHub link goes to the profile** (`github.com/Dani0306`) until the repo is public (DoD #2). Then it switches to the repo.
- **Components live in `app/_landing/`** (a private folder, not a route), plus a small `ui.tsx` for `Button`, `Section` and `Badge`. Nothing outside the landing uses them yet, so there's no `lib/ui`.
- **Assumption:** the design plan's section list (§2) is approved as written. If a section should go, it's one file and one import to drop.

## What this teaches

This task touches none of the 12 teaching topics directly. The closest is #6, citations, from the UI side. The decision is that a citation is an inline `[n]` button paired with an always-visible source panel, highlighted on click and keyboard focus. The rejected alternative is hover tooltips or a modal, which disappear on touch devices and break `AGENTS.md` §3 ("citations visible by default, never behind a modal").

## Files to touch

- `app/layout.tsx` — edit — real `metadata` (title, description, Open Graph title and description, no image yet), `viewport.themeColor` for light and dark, Geist Mono only, a skip link target.
- `app/globals.css` — edit — design tokens (light, dark, `prefers-contrast: more`, `prefers-reduced-transparency`), type scale with size-specific tracking and leading, focus ring, press feedback, reduced-motion overrides; remove the Arial body.
- `app/page.tsx` — rewrite — skip link and `<main>`, composing the sections in order.
- `app/_landing/ui.tsx` — create — `Button` (link or disabled), `Section` (id, eyebrow, title, intro), `Badge`.
- `app/_landing/nav.tsx` — create — sticky translucent header: wordmark, anchors (How it works · Evidence · FAQ), disabled demo button, GitHub link.
- `app/_landing/hero.tsx` — create — headline, subline, two CTAs, a compact static answer card built from the sample data.
- `app/_landing/problem.tsx` — create — two contrasting cards: keyword search, and generic chatbots.
- `app/_landing/citation-demo.tsx` — create — **client** island: the answer with `[n]` buttons and a source panel; the active citation's passage is highlighted. The server-rendered default has `[1]` active, so the evidence shows without JavaScript.
- `app/_landing/refusal-demo.tsx` — create — the "I don't know" state with the closest section.
- `app/_landing/how-it-works.tsx` — create — four-step ordered list with a simple CSS flow diagram, every claim true to `AGENTS.md` §10.
- `app/_landing/evidence.tsx` — create — ablation table (naive vector, hybrid with RRF, hybrid plus rerank × recall@5, MRR, cost per query, p95), plus two target tiles (hallucinated citations: target 0; judge agreement: target ≥85%), all rendering the pending state.
- `app/_landing/audience.tsx` — create — three audience cards plus the agency widget case.
- `app/_landing/trust.tsx` — create — four facts: citations checked in code, refusal decided before the model runs, every model call's cost logged, eval gate in CI (marked *planned* where not built yet).
- `app/_landing/faq.tsx` — create — native `<details>` accordion, five questions with honest answers.
- `app/_landing/cta.tsx` — create — "Ask the docs something", the disabled demo button, the GitHub link.
- `app/_landing/footer.tsx` — create — built by Daniel Colorado, danielcolorado.dev and GitHub links, "Source docs: not ingested yet", the *In the lab* badge.
- `app/_landing/sample-data.ts` — create — scripted question, answer segments with citation ids, sources (title, heading path, anchor, passage), and the refusal case.
- `app/_landing/sample-data.test.ts` — create — every `[n]` in the sample answer maps to a sample source (the product rule, applied to the demo), and ids are unique.
- `app/_landing/evidence-data.ts` — create — `loadEvidence(dir)`: `pending` when the directory is missing or empty, and a clear error when run files exist but aren't wired yet.
- `app/_landing/evidence-data.test.ts` — create — missing directory, empty directory, and a run file present (throws), using a temp dir.
- `public/*.svg` — delete — the five unused create-next-app SVGs.

## Requirements

1. Every section in the design plan §2 is present, in order, with a semantic landmark (`header`, `nav`, `main`, `section` with headings, `footer`) and one `h1`.
2. Copy never states a measured number, user count, customer or capability that doesn't exist. Planned things are labelled *planned*, and Evidence cells say *Pending* with the week they are planned for.
3. The citation demo works by mouse, touch and keyboard. Each `[n]` is a `<button>` with `aria-pressed` and an accessible name ("Citation 1: <source title>"). The highlighted passage is marked by more than colour (an outline and a "Cited" label).
4. The refusal demo reads as a designed state, not an error: "I don't know" plus the closest section and its link.
5. The layout works from 360px up with no horizontal scroll. Citations stay visible on mobile: the source panel stacks under the answer, never in a modal.
6. Light and dark meet WCAG AA contrast for text. `prefers-reduced-motion` removes transforms; `prefers-reduced-transparency` makes the nav solid; `prefers-contrast: more` adds solid borders.
7. Every interactive element has a visible `:focus-visible` ring and press feedback on `:active`. The disabled demo button has `aria-disabled`, isn't focusable as a link, and explains itself.
8. External links use `rel="noopener noreferrer"`. No `dangerouslySetInnerHTML`.
9. Tests run offline and pass with `npm test`.

## Security and data safety

- **Keys stay server-side:** this page needs no keys and makes no fetches or model calls. No environment variables are read.
- **Sample data is fictional and labelled as scripted.** It names no real company, and contains no Third Way Health content and no personal data.
- The only filesystem read is `evals/runs/` at build time, inside the repo.

## Cost impact

$0. No model, embedding or network calls.

## Acceptance criteria

- [ ] `/` renders the landing page and no create-next-app content remains.
- [ ] Clicking or pressing Enter/Space on `[2]` moves the highlight to source 2. With JavaScript off, source 1 is shown highlighted.
- [ ] The Evidence table shows *Pending* in every cell and no number.
- [ ] "Try the demo" is visibly disabled and says why.
- [ ] Layout checked at 360, 768 and 1280 px in light and dark.
- [ ] Reduced-motion and keyboard-only passes done.
- [ ] typecheck, lint, test and build all pass.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build` (layout, config and routes change)
- `npm run dev` and a browser click-through at 360, 768 and 1280 px
- Lighthouse in Chrome DevTools: the owner runs it manually, because no Lighthouse dependency is added

## Manual test steps

1. `npm run dev`, open http://localhost:3000.
2. Tab from the top: the skip link appears first, and focus rings are visible on every control.
3. In "See it cite", click `[2]` then `[3]`. The highlighted passage moves, and the "Cited" label follows.
4. Toggle the OS dark mode and check contrast.
5. DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, then click citations: no movement, the highlight still changes.
6. Resize to 360px: no sideways scroll, and the source panel sits under the answer.
7. Disable JavaScript and reload: the page reads fully, and citation 1 is highlighted.

## Results

Built 5 Nov 2026 on `feat/landing-page`. $0, with no model or network calls.

- **Checks:** typecheck, lint and `npm test` pass (8 tests: 2 existing plus 6 new for the sample data and the Evidence loader). `npm run build` prerenders `/` as fully static (○).
- **Server-rendered HTML** (fetched from the running dev server):
  - one `h1`;
  - every section present, with no create-next-app content left;
  - citation 1 rendered with `aria-pressed="true"`, so the demo reads without JavaScript;
  - Evidence shows only "Pending";
  - no errors in the dev log.
- **Found and fixed:**
  - **Build tracing:** Turbopack warned that `fs` on a variable path traced the whole project into the server bundle. Fixed with `/*turbopackIgnore: true*/`, since the page is static and never reads run files at runtime.
  - **Mobile overflow:** a code review for 360px found that the unbroken source-URL line would overflow the card. Fixed with `break-all` and `min-w-0`.
  - **Tailwind class names:** the IDE suggested canonical Tailwind v4 classes, and these were applied.
- **Not verified by the agent:** the visual pass at 360, 768 and 1280 px in light and dark, the click on `[2]`, reduced motion and keyboard-only use. This session had no browser tool. These are manual test steps 2–7, which the owner runs.
- **Deviations from the design plan** (recorded under Decisions):
  - no scroll-reveal animation;
  - system font instead of Geist Sans;
  - no competitor names;
  - the GitHub link goes to the profile until the repo is public.
