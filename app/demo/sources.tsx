import type { ReactNode, Ref } from "react";
import { codeBody, highlightPassage } from "@/lib/answer/highlight";

export type SourceItem = { n: number; title: string; url: string; snippet: string; content: string };

// The evidence, visible by default and never behind a modal: every retrieved source, numbered as
// the answer cites it. Cited ones are marked once the answer is checked. Clicking a [n] marker makes
// its card active: it expands to the full passage and marks the wording closest to the sentence that
// cited it (lib/answer/highlight.ts). That is a pointer by shared words, not a proof of support.
// Each card links to the exact section on supabase.com.

/** Prose with `inline code` and [links](url) shown the way a reader would see them. */
function Inline({ text }: { text: string }): ReactNode {
  const plain = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  return plain.split(/(`[^`]*`)/g).map((part, i) =>
    part.length > 1 && part.startsWith("`") && part.endsWith("`") ? (
      <code key={i} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.85em]">
        {part.slice(1, -1)}
      </code>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function Passage({ content, claim }: { content: string; claim: string }) {
  const { segments, matched } = highlightPassage(content, claim);
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-accent">
        {matched ? "Closest wording to the sentence you clicked" : "No single sentence matches closely; the whole passage is the source."}
      </p>
      <div className="mt-2 text-[0.9375rem] leading-relaxed [overflow-wrap:anywhere]">
        {segments.map((seg, i) =>
          seg.kind === "code" ? (
            <pre
              key={i}
              className={`my-2 overflow-x-auto rounded-xl border p-3 font-mono text-[0.8125rem] leading-relaxed ${seg.marked ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
            >
              {seg.marked ? <span className="sr-only">Closest wording: </span> : null}
              <code>{codeBody(seg.text)}</code>
            </pre>
          ) : seg.marked ? (
            <mark key={i} className="rounded-[4px] bg-accent-soft whitespace-pre-wrap text-ink underline decoration-accent decoration-2 underline-offset-4 [box-decoration-break:clone]">
              <span className="sr-only">Closest wording: </span>
              <Inline text={seg.text} />
            </mark>
          ) : (
            <span key={i} className="whitespace-pre-wrap text-ink-2">
              <Inline text={seg.text} />
            </span>
          ),
        )}
      </div>
    </div>
  );
}

export function SourceList({
  idPrefix,
  sources,
  cited,
  active,
  claim,
  cardRef,
}: {
  idPrefix: string;
  sources: SourceItem[];
  cited: Set<number> | null;
  active: number | null;
  /** The sentence whose marker was clicked, for the active card's highlight. */
  claim: string | null;
  cardRef: (n: number) => Ref<HTMLLIElement>;
}) {
  return (
    <section aria-label="Sources" className="mt-6">
      <h3 className="text-sm font-medium text-ink-2">
        Sources <span className="font-normal">· retrieved for this question{cited ? `, ${cited.size} cited` : ""}</span>
      </h3>
      <ol className="mt-3 space-y-3">
        {sources.map((s) => {
          const on = active === s.n;
          const isCited = cited?.has(s.n) ?? false;
          return (
            <li
              key={s.n}
              id={`${idPrefix}-source-${s.n}`}
              ref={cardRef(s.n)}
              tabIndex={-1}
              className={`scroll-my-24 rounded-2xl border p-4 transition-[border-color,box-shadow,background-color] duration-200 ease-out sm:p-5 ${
                on ? "border-accent bg-card shadow-(--shadow)" : "border-line bg-card/60"
              }`}
            >
              <div className="flex min-h-5 items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2 font-mono text-xs text-ink-2">
                  <span className={`font-medium ${on ? "text-accent" : ""}`}>{s.n}</span>
                  <span className="truncate">{s.title}</span>
                </p>
                {isCited ? <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">Cited</span> : null}
              </div>
              {on && claim !== null && s.content ? (
                <Passage content={s.content} claim={claim} />
              ) : (
                <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-pretty text-ink-2 [overflow-wrap:anywhere]">{s.snippet}</p>
              )}
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block font-mono text-xs break-all text-accent underline-offset-4 hover:underline"
              >
                {s.url.replace("https://", "")}
                <span className="sr-only"> (opens the section on supabase.com in a new tab)</span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
