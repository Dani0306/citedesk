"use client";

import { useRef, useState } from "react";
import { SAMPLE_ANSWER, SAMPLE_QUESTION, SAMPLE_SOURCES, type Source } from "./sample-data";

const pathOf = (s: Source) => s.headingPath.join(" › ");

// The server render starts with citation 1 active, so the evidence is visible without JavaScript.
export function CitationDemo() {
  const [active, setActive] = useState(1);
  const cards = useRef(new Map<number, HTMLLIElement>());
  const activeSource = SAMPLE_SOURCES.find((s) => s.n === active);

  function select(n: number) {
    setActive(n);
    // On narrow screens the source panel sits below the answer; bring the passage into view.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cards.current.get(n)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.05fr_1fr] lg:gap-6">
      <figure className="rounded-3xl border border-line bg-card p-5 shadow-(--shadow) sm:p-8">
        <figcaption className="text-xs font-medium text-ink-2">Sample · scripted, not a live answer</figcaption>
        <p className="mt-5 ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-surface px-4 py-2.5 text-[0.9375rem]">
          {SAMPLE_QUESTION}
        </p>
        <p className="mt-5 text-pretty leading-[1.8]">
          {SAMPLE_ANSWER.map((sentence, i) => (
            <span key={i}>
              {sentence.text}
              {sentence.cites.map((n) => {
                const source = SAMPLE_SOURCES.find((s) => s.n === n);
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
        <p className="sr-only" aria-live="polite">
          {activeSource ? `Showing source ${activeSource.n}: ${pathOf(activeSource)}` : ""}
        </p>
        <ol className="space-y-3">
          {SAMPLE_SOURCES.map((s) => {
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
                    <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">Cited</span>
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
                <p className="mt-3 font-mono text-xs break-all text-ink-2">acme.example/docs/security/api-keys{s.anchor}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
