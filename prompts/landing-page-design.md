# Landing page design: UI plan

Status: plan only, no code written. Awaiting approval before the implementation prompt (`prompts/NNN-landing-page.md`) is created.

Nothing below is built. The repo still has the default `create-next-app` page, `app/globals.css` with Arial, and the default metadata.

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
