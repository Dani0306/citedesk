import { SAMPLES } from "./sample-data";
import { stagger } from "./ui";

// HTML and CSS, not an SVG with text: a wide SVG shrinks its labels below readable size on a
// phone, while real text stays legible, selectable and themed. The page on the left is
// decorative; the chunks on the right are the content.

const LINES = ["w-full", "w-5/6", "w-3/4"];

function Lines({ count, offset = 0 }: { count: number; offset?: number }) {
  return (
    <div aria-hidden className="space-y-1.5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`h-1.5 rounded-full bg-line ${LINES[(i + offset) % LINES.length]}`} />
      ))}
    </div>
  );
}

export function ChunkDiagram() {
  const sample = SAMPLES[0];
  return (
    <figure className="mb-8 rounded-3xl border border-line bg-card p-5 sm:p-8">
      <figcaption className="text-sm font-medium text-ink-2">One docs page, split at its headings</figcaption>
      <div className="mt-6 grid items-center gap-5 md:grid-cols-[minmax(0,0.85fr)_auto_minmax(0,1.5fr)] md:gap-8">
        <div aria-hidden className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm font-semibold">Security</p>
          <div className="mt-2">
            <Lines count={2} />
          </div>
          <p className="mt-4 text-sm font-semibold">API keys</p>
          {sample.sources.map((s, i) => (
            <div key={s.n} className="mt-3 border-t border-dashed border-ink-2/40 pt-3">
              <p className="font-mono text-xs text-ink-2">{s.headingPath[2]}</p>
              <div className="mt-2">
                <Lines count={2} offset={i} />
              </div>
            </div>
          ))}
        </div>

        <p className="flex items-center justify-center gap-2 text-xs font-medium text-ink-2 md:flex-col">
          <span aria-hidden className="text-lg leading-none">
            <span className="md:hidden">↓</span>
            <span className="hidden md:inline">→</span>
          </span>
          Never splits across a heading
        </p>

        <ol className="space-y-3">
          {sample.sources.map((s, i) => (
            <li key={s.n} style={stagger(i)} className="reveal rounded-2xl border border-line bg-bg p-4">
              <p className="font-mono text-xs text-accent">{s.headingPath.join(" › ")}</p>
              <p className="mt-2 line-clamp-2 text-sm text-pretty text-ink-2">{s.passage.cited}</p>
              <p className="mt-3 font-mono text-xs break-all text-ink-2">
                {s.page}
                {s.anchor}
              </p>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-6 text-sm text-pretty text-ink-2">
        Each chunk keeps its heading path and a link to its section. That link is what a citation points at. Sample
        content.
      </p>
    </figure>
  );
}
