import type { Ref } from "react";

export type SourceItem = { n: number; title: string; url: string; snippet: string };

// The evidence, visible by default and never behind a modal: every retrieved source, numbered as
// the answer cites it. Cited ones are marked once the answer is checked; the active one (picked by
// clicking its marker) is highlighted. Each links to the exact section on supabase.com.

export function SourceList({
  idPrefix,
  sources,
  cited,
  active,
  cardRef,
}: {
  idPrefix: string;
  sources: SourceItem[];
  cited: Set<number> | null;
  active: number | null;
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
              <p className={`mt-2.5 text-[0.9375rem] leading-relaxed text-pretty [overflow-wrap:anywhere] ${on ? "text-ink" : "text-ink-2"}`}>{s.snippet}</p>
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
