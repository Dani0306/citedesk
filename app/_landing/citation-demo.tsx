"use client";

import { useEffect, useRef, useState } from "react";
import { SAMPLES, type Source } from "./sample-data";

const pathOf = (s: Source) => s.headingPath.join(" › ");

// The sticky "story" layout and the scroll observer switch on together. This must stay identical
// to the media query in globals.css (.story / .story-stage / .story-bands): below 800 px of height
// the stage would not fit under the nav, and reduced motion gets no extra scroll length.
const STORY_QUERY = "(min-width: 1024px) and (min-height: 800px) and (prefers-reduced-motion: no-preference)";

// The server render starts with sample 1 and citation 1 active, so the evidence is visible without
// JavaScript. On large screens, scrolling through the section then steps the active citation
// 1 → 2 → 3 until the visitor picks one themselves; after that, scroll never changes it.
export function CitationDemo() {
  const [sampleIndex, setSampleIndex] = useState(0);
  const [active, setActive] = useState(1);
  const [announcement, setAnnouncement] = useState("");
  const sample = SAMPLES[sampleIndex];
  const cards = useRef(new Map<number, HTMLLIElement>());
  const bands = useRef<HTMLDivElement>(null);
  const picked = useRef(false);

  // Why an observer and not a CSS scroll timeline: CSS can restyle the highlight on scroll, but it
  // cannot update `active` or `aria-pressed`, so sighted and assistive-technology state would
  // disagree. Three invisible bands split the sticky wrapper; the one crossing a thin line at 45%
  // of the viewport sets the active citation.
  useEffect(() => {
    const mql = window.matchMedia(STORY_QUERY);
    let observer: IntersectionObserver | null = null;

    const stop = () => {
      observer?.disconnect();
      observer = null;
    };
    const start = () => {
      stop();
      const root = bands.current;
      if (!mql.matches || !root) return;
      observer = new IntersectionObserver(
        (entries) => {
          if (picked.current) return;
          for (const entry of entries) {
            if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
          }
        },
        { rootMargin: "-45% 0px -54% 0px" },
      );
      root.querySelectorAll("[data-step]").forEach((band) => observer?.observe(band));
    };

    start();
    mql.addEventListener("change", start);
    return () => {
      stop();
      mql.removeEventListener("change", start);
    };
  }, []);

  function select(n: number) {
    picked.current = true;
    setActive(n);
    const source = sample.sources.find((s) => s.n === n);
    setAnnouncement(source ? `Showing source ${n}: ${pathOf(source)}` : "");
    // On narrow screens the source panel sits below the answer; bring the passage into view.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cards.current.get(n)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }

  function chooseSample(index: number) {
    picked.current = true;
    setSampleIndex(index);
    setActive(1);
    setAnnouncement(`Showing sample question: ${SAMPLES[index].label}`);
  }

  return (
    <div className="story">
      <div ref={bands} aria-hidden className="story-bands">
        {[1, 2, 3].map((step) => (
          <div key={step} data-step={step} />
        ))}
      </div>

      <div className="story-stage space-y-5">
        <div role="group" aria-label="Sample questions" className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-ink-2">Try a sample:</span>
          {SAMPLES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={i === sampleIndex}
              onClick={() => chooseSample(i)}
              className={`press min-h-9 rounded-full border px-4 text-sm font-medium ${
                i === sampleIndex
                  ? "border-transparent bg-accent-strong text-white"
                  : "border-line bg-card text-ink hover:bg-surface"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div key={sample.id} className="grid items-start gap-4 lg:grid-cols-[1.05fr_1fr] lg:gap-6">
          <figure className="rounded-3xl border border-line bg-card p-5 shadow-(--shadow) sm:p-8">
            <figcaption className="text-xs font-medium text-ink-2">Sample · scripted, not a live answer</figcaption>
            <p className="mt-5 ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-surface px-4 py-2.5 text-[0.9375rem]">
              {sample.question}
            </p>
            <p className="mt-5 text-pretty leading-[1.8]">
              {sample.answer.map((sentence, i) => (
                <span key={i}>
                  {sentence.text}
                  {sentence.cites.map((n) => {
                    const source = sample.sources.find((s) => s.n === n);
                    const pressed = n === active;
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={pressed}
                        aria-label={`Citation ${n}: ${source ? pathOf(source) : "unknown source"}`}
                        onClick={() => select(n)}
                        className={`press ml-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 align-[0.05em] font-mono text-xs font-medium ${
                          pressed ? "bg-accent-strong text-white" : "bg-accent-soft text-accent hover:bg-accent/20"
                        }`}
                      >
                        {n}
                      </button>
                    );
                  })}{" "}
                </span>
              ))}
            </p>
            <p className="mt-6 border-t border-line pt-4 text-sm text-ink-2">
              Select a citation to see the passage behind it.
            </p>
          </figure>

          <div role="region" aria-label="Sources">
            {/* Announces picks only. Scroll-driven changes stay silent so scrolling never talks over the reader. */}
            <p className="sr-only" aria-live="polite">
              {announcement}
            </p>
            <ol className="space-y-3">
              {sample.sources.map((s) => {
                const on = s.n === active;
                return (
                  <li
                    key={s.n}
                    ref={(el) => {
                      if (el) cards.current.set(s.n, el);
                      else cards.current.delete(s.n);
                    }}
                    className={`scroll-my-24 rounded-2xl border p-5 transition-[border-color,box-shadow,background-color] duration-200 ease-out ${
                      on ? "border-accent bg-card shadow-(--shadow)" : "border-line bg-card/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="flex min-w-0 items-center gap-2 font-mono text-xs text-ink-2">
                        <span className={`font-medium ${on ? "text-accent" : ""}`}>{s.n}</span>
                        {pathOf(s)}
                      </p>
                      {on ? (
                        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                          Cited
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-[0.9375rem] leading-relaxed text-pretty">
                      {s.passage.before ? <span className="text-ink-2">{s.passage.before} </span> : null}
                      {on ? (
                        <mark className="rounded-[4px] bg-accent-soft text-ink underline decoration-accent decoration-2 underline-offset-4 [box-decoration-break:clone]">
                          {s.passage.cited}
                        </mark>
                      ) : (
                        <span className="text-ink-2">{s.passage.cited}</span>
                      )}
                      {s.passage.after ? <span className="text-ink-2"> {s.passage.after}</span> : null}
                    </p>
                    <p className="mt-3 font-mono text-xs break-all text-ink-2">
                      {s.page}
                      {s.anchor}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
