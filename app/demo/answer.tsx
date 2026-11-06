import type { ReactNode } from "react";
import { parseAnswer, type Inline } from "./answer-markdown";

// Renders a cited answer from parsed blocks: no HTML strings, ever. A marker that points at a
// retrieved source is a button that jumps to its card; one that doesn't is shown as plain text,
// marked as not a source, and never becomes a link.

export function CiteButton({ n, title, active, onCite }: { n: number; title: string; active: boolean; onCite: (n: number) => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`Source ${n}: ${title}`}
      onClick={() => onCite(n)}
      className={`press ml-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 align-[0.05em] font-mono text-xs font-medium ${
        active ? "bg-accent-strong text-white" : "bg-accent-soft text-accent hover:bg-accent/20"
      }`}
    >
      {n}
    </button>
  );
}

function InvalidMarker({ n }: { n: number }) {
  return (
    <span title="Not a retrieved source" className="ml-0.5 font-mono text-xs text-ink-2 line-through decoration-1">
      [{n}]<span className="sr-only"> (not a retrieved source)</span>
    </span>
  );
}

type Props = {
  text: string;
  titles: Map<number, string>;
  active: number | null;
  onCite: (n: number) => void;
};

export function AnswerBody({ text, titles, active, onCite }: Props) {
  const inline = (inlines: Inline[]): ReactNode[] =>
    inlines.map((part, i) => {
      if (part.type === "code") return <code key={i} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.85em]">{part.text}</code>;
      if (part.type === "strong") return <strong key={i}>{part.text}</strong>;
      if (part.type === "cite") {
        const title = titles.get(part.n);
        return title ? <CiteButton key={i} n={part.n} title={title} active={active === part.n} onCite={onCite} /> : <InvalidMarker key={i} n={part.n} />;
      }
      return <span key={i}>{part.text}</span>;
    });

  return (
    <div className="space-y-4 text-pretty leading-[1.8] [overflow-wrap:anywhere]">
      {parseAnswer(text).map((block, i) => {
        if (block.type === "code") {
          return (
            <pre key={i} className="overflow-x-auto rounded-xl border border-line bg-surface p-4 font-mono text-[0.8125rem] leading-relaxed">
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.type === "heading") return <p key={i} className="font-semibold">{inline(block.inlines)}</p>;
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={i} className={`space-y-1.5 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}>
              {block.items.map((item, j) => (
                <li key={j}>{inline(item)}</li>
              ))}
            </List>
          );
        }
        return <p key={i}>{inline(block.inlines)}</p>;
      })}
    </div>
  );
}
