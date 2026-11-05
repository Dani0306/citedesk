import type { CSSProperties } from "react";
import { ChunkDiagram } from "./chunk-diagram";
import { Section, stagger } from "./ui";

const STEPS = [
  {
    title: "Ingest",
    body: "Docs are split at headings into 500–800-token chunks. Each keeps its heading path and a link to its section.",
    tag: "pgvector · HNSW",
  },
  {
    title: "Retrieve",
    body: "Each question runs a vector search and a full-text search. Reciprocal rank fusion merges the two ranked lists.",
    tag: "vector + full-text · RRF",
  },
  {
    title: "Rerank",
    body: "Optionally, a model reorders the top 50 candidates down to 8. If it fails, the fused order is used.",
    tag: "optional · falls back",
  },
  {
    title: "Answer",
    body: "A weak top score means “I don’t know”, decided before any text is written. Otherwise the model answers from those chunks, and code checks every [n].",
    tag: "streamed · validated",
  },
];

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      eyebrow="How it works"
      title="Four steps, each one measurable."
      intro="This is the architecture being built now. The Evidence section shows what has been measured so far."
    >
      <ChunkDiagram />
      <div className="steps-scope relative">
        {/* Decorative pipeline line (large screens, scroll timelines only): see .connector in globals.css. */}
        {[0, 1, 2].map((k) => (
          <div key={k} aria-hidden style={{ "--k": k } as CSSProperties} className="connector">
            <span className="connector-fill" />
          </div>
        ))}
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} style={stagger(i)} className="reveal relative flex flex-col rounded-3xl border border-line bg-card p-6">
              <span
                aria-hidden
                className="relative z-20 inline-flex size-8 items-center justify-center rounded-full bg-accent-soft font-mono text-sm font-medium text-accent"
              >
                {i + 1}
                <span
                  style={stagger(i)}
                  className="node-lit absolute inset-0 inline-flex items-center justify-center rounded-full bg-accent-strong text-white opacity-0"
                >
                  {i + 1}
                </span>
              </span>
              <h3 className="mt-4 text-lg font-semibold tracking-[-0.01em]">
                <span className="sr-only">Step {i + 1}: </span>
                {s.title}
              </h3>
              <p className="mt-3 flex-1 text-[0.9375rem] text-pretty text-ink-2">{s.body}</p>
              <p className="mt-5 font-mono text-xs text-ink-2">{s.tag}</p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
