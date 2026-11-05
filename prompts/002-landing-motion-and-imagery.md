# 002 — Landing page: scroll motion and imagery

**Status:** done (owner checks pending, see Results)
**Branch:** `feat/landing-motion` (from `feat/landing-page`, because prompt 001 isn't merged to `main` yet)
**Week:** 1 (not in the T01–T48 build guide; owner request, built from `prompts/landing-page-design.md` §9)

## Goal

The landing page from prompt 001 gets scroll-driven motion, a set of coded illustrations and icons, a generated social image, three clickable sample questions in the citation demo, and a back-to-top control. The page stays fully readable with no JavaScript, with reduced motion, and in any browser that ignores the new CSS.

## Docs read

- MDN, `view()` CSS function (read 5 Nov 2026 through a Firecrawl query summary, not the full page) — `animation-timeline: view()` is supported in Chrome and Edge 115, Safari 26 (macOS and iOS), Firefox 159 (desktop and Android), Opera 101, Samsung Internet 23. So "unsupported browser" now means older versions, not a whole engine. **VERIFY:** `animation-range` and `scroll()` weren't in that summary. Both ship with the same spec and are expected in the same releases, so the CSS is guarded on both and the build checks it in a real browser.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.md` (Next 16.4.4) — an `opengraph-image.tsx` default-exports a function returning `ImageResponse` from `next/og`; `alt`, `size` and `contentType` are exported constants; the image is statically optimised (built once) unless it uses request-time APIs.
- `.../04-functions/image-response.md` — only flexbox and a subset of CSS (no `display: grid`); the whole bundle, fonts included, must stay under 500 KB; the default font is used unless one is passed. So the image uses no custom font and no file reads.
- `.../04-functions/generate-metadata.md` (`metadataBase`) — relative image URLs need a base. There is no production domain yet. **VERIFY** in the dev and build output what Next does without `metadataBase`; do not invent a domain. Setting it is part of T43 (deploy).
- `/apple-design` skill — loaded at the start of the build (purpose, restraint, interruptibility, reduced motion). The animation skills (`animate`, `animation-performance`) are used for the property and range choices.

## Code inspected

- `app/globals.css` — tokens, `@utility` blocks (`press`, `glass`, type scale), and `html { scroll-behavior: smooth }` with a reduced-motion override. **Smooth anchor scrolling and `scroll-margin-top` already exist**, so they are not rebuilt.
- `app/_landing/ui.tsx` — `Container`, `Section`, `ButtonLink`, `DemoButton`, `Badge`, `Marker`.
- `app/_landing/citation-demo.tsx` — the only client island: `active` state, `select(n)` scrolls the card into view, a hard-coded `acme.example/docs/security/api-keys` URL line.
- `app/_landing/sample-data.ts` and its test — one scripted question, answer and three sources.
- `hero.tsx`, `problem.tsx`, `refusal-demo.tsx`, `how-it-works.tsx`, `evidence.tsx`, `audience.tsx`, `trust.tsx`, `cta.tsx`, `nav.tsx` — all server components. Evidence is in its pending state; there are no result bars to animate yet.
- `app/layout.tsx` — Open Graph text only, no image, no `metadataBase`, no Twitter card.
- `next.config.ts` — `cacheComponents` on; the page is fully static.
- Prompt 001 → Decisions — "No scroll-reveal animation" and why. This task reverses that decision on purpose, so the reasons it was made have to be designed out (below).

## Decisions and assumptions

- **Reversal of 001, with its objections answered.** 001 rejected scroll-reveal because the usual JS version hides content without JavaScript and flashes on load. CSS scroll-driven animations have neither problem if two rules hold: the default state is the final state, and the animation rules live inside `@supports (animation-timeline: view()) and (animation-range: entry 0% exit 100%)` and `@media (prefers-reduced-motion: no-preference)`. Deleting that one block returns the page to its 001 state. Rejected alternative: an IntersectionObserver that toggles a class, which is the JS flash-and-hide pattern 001 ruled out.
- **Compositor-only motion.** Scroll-linked and load animations change only `transform` and `opacity`. Distances are at most 24 px. One exception: the check-mark icons (20–24 px) draw with `stroke-dashoffset`, because the paint cost of a 20 px path is negligible and a draw reads better than a fade. Colour changes (for example a step badge "lighting up") are done by fading an overlay's opacity, not by animating `background-color`.
- **`animation` shorthand resets `animation-timeline`**, so `animation-timeline` and `animation-range` are always declared after it.
- **Stagger by range, not by delay.** Each item sets `--i`; its `animation-range` is shifted by `calc(var(--i) * 6%)`. `animation-delay` doesn't stagger scroll timelines.
- **Named timeline for the evidence table.** The table sits inside an `overflow-x-auto` wrapper, which is a scroll container, so `view()` on a row would track that wrapper (it doesn't scroll vertically) and never progress. The wrapper's parent defines `view-timeline: --table block`, and the rows reference it. Descendants can use an ancestor's named timeline without `timeline-scope`.
- **One deliberate exception to "no new client JS": the sticky citation story.** CSS can restyle the highlight on scroll, but it can't update React's `active` state or `aria-pressed`, so a CSS-only version would show one source highlighted while the buttons say another is pressed. The existing island therefore gets a small IntersectionObserver: three invisible bands partition a tall wrapper, and the band crossing a line at 45% of the viewport sets `active`. Rejected alternative: CSS-only highlight, because it desyncs sighted and assistive-tech state.
  - It only runs when `(min-width: 1024px) and (min-height: 800px) and (prefers-reduced-motion: no-preference)` matches. The same string gates the CSS that makes the wrapper tall and the stage `position: sticky`, so below 800 px of height the stage would not fit the viewport and the page falls back to the plain 001 layout.
  - The first click on any `[n]` or chip sets a `picked` ref and the scroll stops changing `active`. Scroll-driven changes never call `scrollIntoView` and never write to the `aria-live` region; only clicks do. No scroll hijacking: the wrapper is about 180 vh, the user scrolls natively.
- **Hero "streaming" is a CSS fade-up per sentence, not typed text.** Typing needs JS and would hide the answer without it. Each sentence has `animation: fade-up 450ms ease-out backwards` with a delay from `--i`; with animations disabled the full text is simply there. The hero headline is not animated (no LCP cost).
- **The diagram is HTML/CSS with real text, not an SVG with text.** A 720-unit SVG scales to about 0.45× at 360 px, so its labels would render under 6 px. Real text stays legible, selectable and themed. SVG is used only for decorative spot art and icons. Rejected alternative: a single SVG diagram.
- **Deviations from the design plan §9.3**, recorded now:
  - the connector line in "How it works" is a `div` scaled with `scaleX` (compositor) at `lg` and up, not an SVG `stroke-dashoffset` path; below `lg` the steps only stagger in;
  - the keyword-search card gets a sequenced "0 results" fade instead of a strike-through, because striking the query would imply the query was wrong;
  - result bars in Evidence are **not built**: no run data exists and the loader throws on real run files until T27, so they would be dead code. They arrive with T27;
  - no `<Reveal>` component: a class plus a `stagger(i)` helper does the same without an extra wrapper element.
  - recorded during the build: hero sentences fade in without moving (transforms don't apply to inline text, and `inline-block` would break line wrapping); the pipeline line is three segments between the badges, not one line, because each animated card is its own stacking context and a continuous line would cross the badges; the trust list has icons but no drawn check marks, because a check beside a rule that isn't built yet would read as "done"; the CTA glow uses `closest-side` so it fades out at the box edge instead of clipping.
- **The Open Graph and Twitter images carry words only** (wordmark, "Answers you can check.", the one-line description, "In the lab"). No numbers, no fake UI.
- **Assumptions.** (1) The owner's answers hold: sticky story yes, coded SVG only (no AI-generated art, no credits), static page for old browsers, quick wins = sample chips and back-to-top. If sticky feels wrong in the browser, it's one media block plus the observer to remove. (2) The 800 px height threshold is a guess; tune it in the browser.

## What this teaches

This touches none of the 12 teaching topics. The decision worth recording is progressive enhancement for motion: effects are added on top of a complete page behind feature queries, so failure means "no motion", never "no content". The rejected alternative is a JS animation library or observer, which is more code and brings back the hide-until-hydrated failure.

## Files to touch

- `app/globals.css` — edit — motion tokens (`--ease-out`, `--reveal-distance`), keyframes and the guarded block: `.reveal`, `.stagger-range`, `.hero-sentence`, `.draw-icon`, `.progress-line`, `.nav-edge`, the sticky-story media block, `.rise-in`. Existing reduced-motion rules stay.
- `app/_landing/ui.tsx` — edit — `stagger(i)` helper (typed `CSSProperties`); `Section` header gets the reveal class.
- `app/_landing/illustrations.tsx` — create — two text-free spot illustrations (search missing a page; an answer with no source), the icon set (audience ×3, trust ×4, check), all `aria-hidden`, `currentColor`, one 24 px grid and 1.6 stroke weight (matches the refusal icon).
- `app/_landing/chunk-diagram.tsx` — create — HTML/CSS: a page with heading rows splitting into chunk cards labelled with heading paths taken from `SAMPLES[0].sources`, then "passed to the model". A `figure` with a caption; a thin SVG for the split lines.
- `app/_landing/nav.tsx` — edit — reading-progress line (`scroll(root)`, `scaleX`); edge shadow that fades in over the first 80 px.
- `app/_landing/hero.tsx` — edit — sentence-by-sentence load sequence; chips pop after their sentence; small exit drift on the preview card. Reads `SAMPLES[0]`.
- `app/_landing/problem.tsx` — edit — spot illustrations; cards stagger; the "no source" underline draws; the "0 results" fades in after the query.
- `app/_landing/citation-demo.tsx` — edit — sample chips, per-sample page path in the URL line, sticky stage wrapper, the band observer, `picked` ref.
- `app/_landing/refusal-demo.tsx` — edit — relevance bar and threshold line (HTML/CSS, labelled "Illustrative", no numerals, `role="img"` with a text alternative), then the refusal card rises; check icons draw.
- `app/_landing/how-it-works.tsx` — edit — chunk diagram above the steps; connector line and badge overlay at `lg`; step stagger.
- `app/_landing/evidence.tsx` — edit — named view timeline on the outer wrapper; rows stagger; target tiles rise. Pending state otherwise unchanged.
- `app/_landing/audience.tsx`, `trust.tsx` — edit — icons; stagger; trust check marks draw.
- `app/_landing/cta.tsx` — edit — heading and buttons ease in; a soft glow pseudo-element drifts with scroll (`transform` only).
- `app/_landing/back-to-top.tsx` — create — fixed link to `#top`, 44 px target, appears after about 40 vh of scroll via `visibility` + `opacity` on a `scroll(root)` timeline (so it isn't focusable while hidden). Hidden entirely where scroll timelines are unsupported (convenience only).
- `app/page.tsx` — edit — render `BackToTop`.
- `app/_landing/sample-data.ts` — edit — `SAMPLES: Sample[]` (question, answer, sources, `page` path); the first is the existing API-keys sample, plus two fictional "Acme Cloud" ones (webhook retries and signing; who can delete a project), three sources each. Keep `SAMPLE_REFUSAL`. Existing exports are replaced by `SAMPLES[0]` where used.
- `app/_landing/sample-data.test.ts` — edit — the three existing rules run for every sample; each sample has exactly three sources (keeps the sticky stage height stable).
- `app/opengraph-image.tsx`, `app/opengraph-image.alt.txt` or exported `alt` — create — 1200×630, light theme, flexbox only, default font, wordmark plus tagline.
- `app/twitter-image.tsx` — create — re-exports the Open Graph image. **VERIFY** the generated `twitter:image` tag appears (otherwise add `twitter: { card: "summary_large_image" }` to `layout.tsx`).
- `app/layout.tsx` — edit — only if the Twitter card needs it. No `metadataBase` until a domain exists (T43).
- `prompts/landing-page-design.md` — edit — add this task's deviations to §9.

## Requirements

1. **Nothing is hidden by default.** With the guarded CSS block removed, JS disabled, `prefers-reduced-motion: reduce`, or an unsupported browser, every section, sentence, row and control is visible at its final position. This is checked, not assumed.
2. All new motion sits in one `@media (prefers-reduced-motion: no-preference)` plus `@supports (animation-timeline: view()) and (animation-range: entry 0% exit 100%)` block. Under reduced motion nothing moves or fades; the citation highlight and the chips still change state.
3. Scroll-linked and load animations use `transform` and `opacity` only (the check icons are the one stated exception). No layout-affecting property is animated.
4. Load-time animation exists only in the hero: 300–500 ms, ease-out, plays once. Everything else is scroll-linked.
5. No scroll hijacking: no scroll locking, no scroll-snap, no wheel handlers. The sticky stage exists only when the viewport matches `(min-width: 1024px) and (min-height: 800px) and (prefers-reduced-motion: no-preference)`.
6. The citation demo works by mouse, touch and keyboard before and after the change. A click on `[n]` or a chip stops scroll-driven changes. Scroll-driven changes never move the page and never announce through the `aria-live` region.
7. Sample chips are buttons with `aria-pressed`, in a labelled group; switching a sample resets `active` to 1. Every sample is labelled "Sample · scripted, not a live answer", and each sentence of every sample cites a source that contains its claim.
8. Illustrations are decorative (`aria-hidden`) or have a text alternative. They use theme tokens or `currentColor` so they follow light, dark and `prefers-contrast: more`. No raster images ship on the page, and nothing stock, fake-logo or fake-screenshot.
9. The relevance bar shows no number and is labelled "Illustrative". Hero, diagram and demos introduce no figure that isn't already stated in the 001 copy or `AGENTS.md`.
10. Back-to-top is a plain `<a href="#top">` with an accessible name, a visible focus ring and `:active` feedback; it is not focusable while invisible.
11. The social image is generated at build time, uses no custom font and no file read, and contains no number or claim beyond the page's own copy.
12. The page still has no horizontal scroll at 360 px; the first-load transfer does not grow by more than a few KB (no image or library added).
13. `npm test` stays offline and passes.

## Security and data safety

- No keys, no network calls, no model calls. The page remains static server components plus the one existing client island.
- Sample content is fictional ("Acme Cloud"), labelled as scripted, and contains no Third Way Health content or personal data.
- No new dependency.

## Cost impact

$0 in model spend. Verifying browser support for this plan used 5 Firecrawl credits (one page scrape); no other paid calls. No AI-generated imagery (owner chose coded SVG only).

## Acceptance criteria

- [ ] With JS disabled: the whole page is readable, citation 1 is highlighted, the first sample is shown, nothing is blank.
- [ ] With `prefers-reduced-motion: reduce`: no movement or fades anywhere; clicking citations and chips still works; no extra blank scroll length from the sticky wrapper.
- [ ] In a browser with the motion block deleted (or `@supports` forced off in DevTools): the page matches the 001 layout and content.
- [ ] At 1280×900, scrolling through "See it cite" steps the highlight 1 → 2 → 3 while the stage stays in view; a click on `[2]` stops the stepping; at 1280×700 and at 768 px the stage is not sticky.
- [ ] Reveals, the progress line, the connector line and the gauge run smoothly with 4× CPU throttling and show no long task or layout work in the Performance panel.
- [ ] Evidence still shows only "Pending"; no result bars exist.
- [ ] Dark mode and `prefers-contrast: more` checked for every illustration and icon.
- [ ] `/opengraph-image` returns a 1200×630 PNG, and the page head has `og:image` (and `twitter:image`) tags.
- [ ] Cumulative layout shift stays at 0 in Lighthouse; accessibility score does not drop.
- [ ] typecheck, lint, test and build pass.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build` (new routes: the two image files; config-adjacent metadata)
- `npm run dev` and the manual steps below (no browser tool in the agent's environment, so the visual and motion checks are the owner's)
- Lighthouse in Chrome DevTools, run manually

## Manual test steps

1. `npm run dev`, open http://localhost:3000 at 1280×900. Scroll top to bottom: the progress line fills, sections ease in once as they enter, nothing is clipped or late.
2. In "See it cite", scroll slowly: the highlight steps 1 → 2 → 3. Click `[1]`, then scroll on: the highlight no longer moves by itself. Click a sample chip: the answer and sources change and the highlight returns to 1.
3. Resize the window to 1280×700, then 768 wide: the stage no longer sticks and the section scrolls like the 001 version.
4. DevTools → Rendering → `prefers-reduced-motion: reduce`, reload: no movement, no extra blank scroll; clicks still work.
5. DevTools → Settings → Debugger → Disable JavaScript, reload: everything is readable and complete.
6. Tab through the page: focus order is unchanged, rings are visible, the back-to-top link is skipped until it appears.
7. Toggle the OS dark mode and, in Rendering, `prefers-contrast: more`: illustrations and icons stay visible.
8. Open http://localhost:3000/opengraph-image: a clean 1200×630 image. View source: `og:image` and `twitter:image` are present. Note what Next does about the missing `metadataBase` (dev warning or fallback).
9. Throttle CPU 4× and record a scroll in the Performance panel: no long tasks, no layout/recalculate-style spikes from the animations.
10. Lighthouse (mobile and desktop): CLS 0, accessibility not lower than before.

## Results

Built 5 Nov 2026 on `feat/landing-motion` (7 commits). $0 in model spend; 5 Firecrawl credits for the browser-support check.

- **Checks:** typecheck, lint and `npm test` pass (16 tests: the sample-data rules now run for each of three samples). `npm run build` prerenders `/`, `/opengraph-image` and `/twitter-image` as static. No new dependency.
- **Verified by the agent in headless Chrome** (driven over the DevTools protocol from the scratchpad; Chrome has scroll timelines):
  - desktop 1280×900, light and dark, a full scroll: progress line, reveals, gauge, pipeline segments, back-to-top and glow all render; mobile 390 and tablet 768 have no horizontal overflow;
  - the sticky stage steps citation 1 → 2 → 3 while scrolling and returns to 1 on the way back; a click on `[2]` stops scroll-driven changes; a sample chip switches the sources, resets to 1 and announces it;
  - `prefers-reduced-motion: reduce` leaves `document.getAnimations()` at 0 and the stage non-sticky; at 1280×700 and at 768 the stage is non-sticky; with JavaScript disabled the page is complete;
  - `/opengraph-image` is a 1200×630 PNG and the page head carries `og:image` and `twitter:image` plus the card tags (the file convention adds them, so `layout.tsx` is unchanged).
- **Found and fixed:** a source card grew 4 px when it gained the "Cited" badge, which became a layout shift once scrolling could trigger it. Reserved the height; layout shift over a full scroll went from 0.013 to about 0.002 in the dev server (Lighthouse not run). The OG headline wrapped and crowded the text below; its size was reduced.
- **Known limits:** `metadataBase` is unset, so build output warns and `og:image` points at `http://localhost:3000`; that is fixed with the domain at deploy (T43). The hero load sequence plays once on load, so on a desktop first screen it is seen, and on phones the preview follows the scroll instead.
- **Not verified by the agent:** Safari and Firefox (support per MDN, not tested), real touch, a keyboard-only pass, Lighthouse, and the Performance-panel check with 4× CPU throttling (manual steps 6, 9 and 10). A visual review of how it feels in motion also needs your eyes; screenshots are still frames.
