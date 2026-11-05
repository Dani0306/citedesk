import { NoSourceArt, SearchMissArt } from "./illustrations";
import { Section, stagger } from "./ui";

const CARDS = [
  {
    title: "Keyword search misses the question",
    body: "Someone asks how to renew a key. The page is called “Rotating a key”, so a search for “renew” finds nothing.",
    art: SearchMissArt,
    example: { label: "search", text: "renew api key", result: "0 results", mark: false },
  },
  {
    title: "Generic chatbots answer anyway",
    body: "They write a fluent answer whether or not your docs say it, and nothing shows where it came from, so nobody can check it.",
    art: NoSourceArt,
    example: { label: "chatbot", text: "“Keys last 12 months.”", result: "no source", mark: true },
  },
];

export function Problem() {
  return (
    <Section
      id="problem"
      eyebrow="The problem"
      title="The same questions, every week."
      intro="Docs nobody can search get asked about instead. The two usual fixes both fail in ways you can’t see."
    >
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        {CARDS.map((c, i) => (
          <article key={c.title} style={stagger(i)} className="reveal rounded-3xl border border-line bg-card p-6 sm:p-8">
            <c.art />
            <h3 className="mt-5 text-xl font-semibold tracking-[-0.015em]">{c.title}</h3>
            <p className="mt-3 text-pretty text-ink-2">{c.body}</p>
            <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface px-4 py-3 font-mono text-sm">
              <span className="text-ink-2">{c.example.label}</span>
              <span className={c.example.mark ? "underline-draw" : undefined}>{c.example.text}</span>
              <span style={stagger(4)} className="fade-scroll ml-auto text-ink-2">
                → {c.example.result}
              </span>
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}
