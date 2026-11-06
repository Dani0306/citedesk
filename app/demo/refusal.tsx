import type { RefusalData } from "@/lib/answer/ui-message";

// The refusal is a designed state (T30): an honest "I don't know", why, and the closest section,
// so the reader still has somewhere to go. Never an empty box or a guess.

const WHY: Record<RefusalData["reason"], string> = {
  low_score: "The docs I have don't cover this closely enough to answer it.",
  not_in_sources: "The closest sections don't actually answer it.",
  no_matches: "Nothing is indexed yet.",
};

export function RefusalCard({ data }: { data: RefusalData }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 sm:p-6">
      <p className="text-lg font-semibold">I don&apos;t know.</p>
      <p className="mt-1.5 text-ink-2 text-pretty">{WHY[data.reason]}</p>
      {data.closest ? (
        <div className="mt-5 rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-2">Closest section</p>
          <p className="mt-1.5 font-mono text-xs text-ink-2">{data.closest.title}</p>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-pretty [overflow-wrap:anywhere]">{data.closest.snippet}</p>
          <a
            href={data.closest.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block font-mono text-xs break-all text-accent underline-offset-4 hover:underline"
          >
            {data.closest.url.replace("https://", "")}
            <span className="sr-only"> (opens the section on supabase.com in a new tab)</span>
          </a>
        </div>
      ) : null}
      <p className="mt-4 text-sm text-ink-2 text-pretty">
        This demo answers only from the Supabase Database and AI guides. Questions about Auth, Storage or other products land here on purpose.
      </p>
    </div>
  );
}
