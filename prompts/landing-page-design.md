# Landing page design: UI plan

Status: approved and built through `prompts/001-landing-page.md` (5 Nov 2026). That file records where the build departs from this plan.

Section 9 (added 5 Nov 2026) plans a second pass: scroll animations and imagery. It was approved and built through `prompts/002-landing-motion-and-imagery.md`, which records where the build departs from section 9.

## 1. Constraints from the project

- **Honesty:** CiteDesk is "in the lab" and not deployed. The ablation numbers, groundedness and cost per answer don't exist yet, and the demo mode isn't built.
- **No invented numbers.** The page renders real values from `evals/runs/*.json` once they exist. Until then it shows labeled empty states such as "Measured in week 2". This is also the portfolio's main claim: evidence, not features.
- **Audience:** the real reader is a hiring manager. The product framing is for buyers: small companies with an unsearchable wiki, and agencies wanting an "ask our docs" widget.
- **Stack:** Next.js 16 App Router and Tailwind v4, with no component library (per `AGENTS.md`). Before coding, read `node_modules/next/dist/docs/` for the metadata, `next/font` and layout APIs.
- **Boundaries:** the landing page is static server components with no keys and no model calls. The only client code is small interaction islands.

## 2. Page structure

Sections follow the usual order for a developer-facing AI product, adapted to what we can prove:

| # | Section | Purpose | Content |
|---|---|---|---|
| 0 | **Nav** | Orientation | Wordmark, anchors (How it works · Evidence · FAQ), "Try the demo" button, GitHub link. Sticky with translucent blur. |
| 1 | **Hero** | One-sentence value | "Answers you can check." Subline: answers only from your docs, cites the passage behind every sentence, says "I don't know" otherwise. CTAs: *Try the demo* (primary) and *See the evidence* (secondary). Beneath it, a static mock of a streamed answer with `[1]` `[2]` markers. |
| 2 | **The problem** | Name the pain | Keyword search misses reworded questions. Generic chatbots invent answers nobody can verify. Two contrasting cards. |
| 3 | **Citations demo** | The central proof | A product visual: answer on the left, source panel on the right. Clicking `[n]` highlights the exact passage (a client island using scripted sample data, not a real API). |
| 4 | **Honest refusal** | The differentiator | A second visual showing the "I don't know" state with the closest section. Copy: "A wrong answer costs more than no answer." |
| 5 | **How it works** | Credibility for engineers | Four steps: ingest and chunk by heading → hybrid retrieval (vector + full-text, RRF) → optional rerank → cited, validated answer. A simple diagram, with every claim true to the architecture. |
| 6 | **Evidence** | The portfolio centerpiece | Ablation table (naive vector → hybrid → hybrid + rerank): recall@5, MRR, cost per query, p95. Plus hallucinated citations (target 0) and judge agreement. Placeholder state until runs exist, then generated from run files. |
| 7 | **Who it's for** | Match buyers | Three cards: support/ops teams, new hires and students, developer-docs teams. Plus the "ask our docs" widget case for agencies. |
| 8 | **Built to be trusted** | Differentiate from vendors | Short list: citations checked in code, refusal decided before the model runs, per-call cost logging, eval gate in CI. Any competitor mention is linked, dated and marked vendor-claimed. |
| 9 | **FAQ** | Remove objections | Which docs does it use? What if it doesn't know? Does it use my data for training? Cost? Languages? Accordion. |
| 10 | **Final CTA** | Convert | "Ask the docs something" → demo, plus repo link. |
| 11 | **Footer** | Wrap-up | Built by Daniel Colorado, links to danielcolorado.dev and GitHub, "Source docs: <corpus + pinned commit>", status badge. |

Deliberately **left out**: pricing tiers, customer logos, testimonials, "trusted by" bars, and a sign-up form. None are true, and `CLAUDE.md` forbids auth and payments.

## 3. Applying the Apple design principles

The `/apple-design` skill is not loaded yet. It will be loaded at the start of the build and mapped onto each section. Planned direction:

- **Typography:** large, tight-tracked headlines with generous leading, plus a mono face for citations and the source panel. This replaces the Arial body in `globals.css`; Geist stays if it fits.
- **Restraint:** one accent color, mostly neutral surfaces, lots of whitespace, one idea per viewport.
- **Depth and materials:** translucent nav, soft layered cards, and subtle borders that work in both light and dark mode.
- **Motion:** spring-based, interruptible and tied to meaning (a citation highlight, a streaming answer, section reveal on scroll). It respects `prefers-reduced-motion`, and the product demos still work with no motion.
- **Citations are always visible**, not hidden behind modals, including on mobile (`AGENTS.md` §3). Each interactive element gets a focus ring and a disabled state, and color is never the only signal.

## 4. Technical plan

**Routes:** `/` becomes the landing page. The real app will live at `/ask`, built later (T29). The "Try the demo" button points there but is disabled and labeled "Demo opens after deploy" until it exists, so it never links to a dead route.

**Components** (new folders, created only as needed):

```
app/page.tsx                  composes sections (server)
app/_landing/
  nav.tsx  hero.tsx  problem.tsx  citation-demo.tsx (client)
  refusal-demo.tsx  how-it-works.tsx  evidence.tsx
  audience.tsx  trust.tsx  faq.tsx  cta.tsx  footer.tsx
  sample-data.ts              scripted answer, sources, refusal case
  evidence-data.ts            reads latest run file or returns "pending"
lib/ui or app/_ui/            Button, Section, Badge (only if reused)
```

**Also changed:** `layout.tsx` (real title, description, Open Graph tags, theme color), `globals.css` (design tokens, light and dark), and `public/` (remove the default Next/Vercel SVGs).

**Data for the Evidence section:** `evidence-data.ts` reads the newest file in `evals/runs/` at build time and falls back to a "pending" state. It is wired to the same source `eval:report` will use (T27), so the landing and README never disagree.

**Quality bars:** responsive from 360px up, WCAG AA contrast, keyboard navigable, a Lighthouse pass, and semantic landmarks. The metadata copy will be proper rather than left at defaults.

## 5. Build phases (each is a small commit on a branch)

1. **Foundations:** tokens, type scale, layout shell, metadata, nav and footer.
2. **Top of page:** hero, problem, and who it's for.
3. **Proof sections:** citation demo (interactive), refusal demo, and how it works with its diagram.
4. **Evidence and trust:** the ablation table in its pending state, the trust list, and the FAQ.
5. **Polish:** motion, reduced-motion, dark mode check, mobile pass, focus states, and Lighthouse.
6. **Checks:** `typecheck`, `lint`, `test`, `build`, and a click-through in `npm run dev`.

## 6. Later swaps

- **Tasks T29 to T31 and T44:** the scripted citation demo gets replaced by the real streamed UI.
- **T45 to T46:** the Evidence section starts showing real numbers, and the status badge changes only after deploy.

## 7. Decisions needed from the owner

1. **Landing vs. app route.** Recommendation: `/` for the landing and `/ask` for the app. Alternative: put the demo inline on the landing.
2. **Light, dark, or both?** Recommendation: both through `prefers-color-scheme`, with light as the Apple-style default.
3. **Language.** English only? Recommendation: yes, since the corpus decision is still open. A Spanish version can come with the multilingual stretch item.
4. **Corpus mention.** The footer and hero sample answer depend on open decision 1. Recommendation: write the sample as neutral "your docs" content for now, unless the Supabase docs are settled first.

## 8. Next step

On approval, write `prompts/NNN-landing-page.md` from `prompts/_template.md` for owner approval, then build to it.

(Done for the first pass: see `prompts/001-landing-page.md`. The second pass is in section 9.)

## 9. Second pass: scroll animations and imagery

Goal: make the page more engaging and easier to scan without adding claims the project can't back. Plan only; the implementation prompt (`prompts/002-landing-motion-and-imagery.md`) is written after approval, and the `/apple-design` skill is loaded at the start of that build.

### 9.1 Why this reverses an earlier decision

Prompt 001 dropped scroll-reveal because the usual implementations (JS observers toggling a hidden class) either hide content from visitors without JavaScript or flash on load. The fix is to build the reveals so those two failure modes can't happen:

- **CSS scroll-driven animations** (`animation-timeline: view()` and `scroll()`), with no JS and no new dependency.
- **Visible by default.** The un-animated state is the final state. The animation lives inside `@supports (animation-timeline: view())` and `@media (prefers-reduced-motion: no-preference)`. A browser without support, a visitor with reduced motion, or a failed stylesheet all see the complete page.
- **Only `transform` and `opacity`**, so nothing triggers layout or paint on the main thread. Distances are small (24px at most).
- **VERIFY before building:** current browser support for scroll-driven animations (Chromium has it; Safari and Firefox status must be checked on MDN or caniuse). Unsupported browsers get the static page, which is acceptable and tested.

### 9.2 Motion rules

- Motion has to carry meaning (a result arriving, a citation linking to its source, a pipeline progressing). Nothing animates just to decorate.
- Scroll never gets hijacked: no locked scrolling, no snap that fights the user. A sticky stage is allowed only where the content is still readable if the user scrolls past quickly.
- Clicking still works everywhere and overrides any scroll-driven state. The citation demo stays fully usable by click and keyboard.
- Stagger comes from a per-item `--i` custom property that shifts each item's `animation-range`, not from `animation-delay` (which doesn't apply to scroll timelines the same way).
- Load-time animation (hero only) uses 300–500 ms with an ease-out curve, plays once, and shows the final state under reduced motion.
- No count-up numbers and no fake "live" activity. Illustrative values are labelled as such.

### 9.3 Animation inventory

| Section | Motion | Purpose |
|---|---|---|
| Whole page | Thin reading-progress bar under the nav (`scroll()` timeline, `scaleX`). Smooth anchor scrolling under `no-preference`, with `scroll-margin-top` so headings clear the sticky nav. | Orientation on a long page. |
| Nav | Border and background strengthen once the page leaves the top. Optional active-section indicator (see 9.6). | Shows where you are. |
| Hero | On load, the mock answer "streams" sentence by sentence and the `[1]` `[2]` chips pop in after their sentence. The mock drifts about 24px slower than the page while scrolling away. | Previews the product's behaviour in two seconds. |
| Problem | Two cards rise in with a small stagger. In the chatbot card, an underline draws under the uncited claim as it enters. In the keyword card, the missed match is struck through. | Makes the contrast visible instead of described. |
| Citations demo | Desktop only: a sticky stage over about 150vh. As the user scrolls, the answer streams, then `[1]` activates and its source passage highlights, then `[2]`. Mobile: plain reveal, no sticky. A click on any `[n]` overrides the scroll state. | The central proof, shown stepwise. |
| Honest refusal | A relevance bar fills but stops short of the threshold line; the "I don't know" card and the closest-section link then rise in. No numerals unless labelled illustrative. | Shows that refusal is decided before the model answers. |
| How it works | A connecting line draws down through the four steps (SVG path with `pathLength="1"` and `stroke-dashoffset`). Each step's node lights as the line reaches it. | Conveys the pipeline order. |
| Evidence | Table rows reveal in order. Once real run data exists, result bars grow from zero with `scaleX`. The pending state stays static. | Draws the eye to the centerpiece without implying results before they exist. |
| Who it's for, Trust | Cards stagger in. Check marks draw in on the trust list. | Light rhythm. |
| FAQ | No scroll motion (the disclosure transition from 001 stays). | Keep it quiet. |
| Final CTA | Heading and button ease in once; the soft background gradient shifts slightly with scroll. | A clear end point. |

Reduced motion: every scroll-linked and load animation is removed (not shortened). The citation highlight state still changes, as in 001.

### 9.4 Images

Principle: every visual is either real product output or clearly labelled sample data. No stock photos of people, no fake customer logos, and no screenshot of an app that doesn't exist yet.

| Asset | Type | Notes |
|---|---|---|
| Hero product window | Coded HTML/CSS (exists; refined) | Labelled "Sample answer". Inline, so it follows light and dark tokens. |
| Problem spot illustrations (2) | Inline SVG | A magnifier missing the page; an answer bubble with no source. |
| Doc → chunks illustration | Inline SVG | A page split at headings into chunks with heading-path labels, then narrowing to the few passed to the model. Sits in "How it works". |
| Refusal gauge | Inline SVG | Relevance bar and threshold line. |
| Audience and trust icons | Inline SVG icon set | One 24px grid, one stroke weight, `currentColor`. Replaces any emoji or mixed icon styles. |
| Open Graph / Twitter image | `app/opengraph-image.tsx` (generated at build with `next/og`) | 1200×630, wordmark and tagline only, with alt text. Currently there is no social image. VERIFY the file convention in `node_modules/next/dist/docs/`. |
| Real screenshots | Later swap | After T29 / T42 / T44 and the deploy, replace scripted visuals with captures of the real `/ask` app and the playground, and add the demo video poster. |
| AI-generated art (optional) | Raster | Not in the plan by default. If wanted: abstract gradient or texture backgrounds only, no UI, no people, no logos. It uses an external image service and credits, so it is ask-first (`AGENTS.md` §2). |

Handling: inline SVG wherever it needs dark mode (no separate light/dark rasters). Any raster goes through `next/image` with explicit width and height (no layout shift), `priority` only on the hero, and meaningful `alt` (decorative art gets `alt=""` or `aria-hidden`). Budget: under about 300 KB of images on first load.

### 9.5 Technical plan

No new dependency, no new client JavaScript for the scroll effects.

```
app/globals.css               add motion tokens (--ease-out, --reveal-distance) and
                              utility classes: .reveal, .reveal-stagger (uses --i),
                              .draw-line, .progress-bar, .hero-stream
app/_landing/ui.tsx           add <Reveal> wrapper (server component, just a class)
app/_landing/illustrations.tsx   inline SVGs (problem, chunks, gauge, icons)
app/_landing/citation-demo.tsx   sticky stage + step states (stays a client island)
app/_landing/*.tsx            apply classes per the inventory
app/opengraph-image.tsx       generated social image
app/layout.tsx                point metadata at the OG image
```

Everything lives inside the `@supports` and `prefers-reduced-motion` guards, so removing the block returns the page to the 001 state.

### 9.6 Optional quick wins for usability

Each is small and independent; none is required for the pass.

1. **Sample-question chips** in the citation demo: three scripted Q&A pairs the visitor can switch between, all labelled sample data. Needs two more scripted sets in `sample-data.ts` and its test.
2. **Active-section indicator** in the nav, via CSS `scroll-target-group` / `:target-current` (VERIFY support) or a tiny IntersectionObserver island as a fallback.
3. **Back-to-top** control that appears after the first screen, as a link to `#top`, not a script.

### 9.7 Build phases (small commits on a new branch)

1. **Motion foundations:** tokens, guarded utilities, `<Reveal>`, progress bar. Check the empty state first: with the guards off, the page must look identical to 001.
2. **Hero and problem:** load sequence, parallax drift, drawn underline.
3. **Citation story:** sticky stage, step states, click override, mobile fallback.
4. **Refusal and pipeline:** gauge fill, drawn connector line.
5. **Illustrations and icons:** the SVG set, applied to each section.
6. **Open Graph image:** generated image and metadata.
7. **Remaining reveals** (evidence, audience, trust, CTA), then optional quick wins.
8. **Checks:** `typecheck`, `lint`, `test`, `build`.

### 9.8 How we'll verify

CSS motion can't be unit-tested, so the proof is manual and the prompt will list exact steps:

1. Chrome: scroll the whole page at 100% and with CPU 4× throttling; the Performance panel shows no long tasks or layout work from the animations.
2. DevTools → Rendering → `prefers-reduced-motion: reduce`: nothing moves, all content visible, citation highlight still works.
3. JavaScript disabled: full content visible, no gaps.
4. A browser without scroll-driven animation support: static page, nothing missing.
5. 360, 768 and 1280 px in light and dark; no horizontal scroll.
6. Keyboard only: focus order and focus rings unaffected by the sticky stage.
7. Lighthouse: no regression in accessibility, and cumulative layout shift stays at 0.

### 9.9 Decisions needed from the owner

1. **Sticky storytelling** for the citation demo (desktop only, click overrides)? Recommendation: yes. It is the strongest engagement gain, and it degrades to a plain reveal.
2. **Images:** coded SVG only (recommended), or also AI-generated abstract backgrounds (spends credits, ask-first)?
3. **Unsupported browsers** get the static page. Recommendation: accept this rather than adding a JS fallback or the `motion` library.
4. **Quick wins** in 9.6: which of the three, if any? Recommendation: chips (1) and back-to-top (3).
