import { SampleLabel } from "./hero";
import { SAMPLE_REFUSAL } from "./sample-data";
import { Section } from "./ui";

const POINTS = [
  "Decided in code from the retrieval score, not by asking the model to be careful.",
  "The threshold is tuned on questions the docs can’t answer, so refusals are measured too.",
  "You still get somewhere to look: the closest section by name.",
];

export function RefusalDemo() {
  return (
    <Section
      id="refusal"
      eyebrow="Honest refusal"
      title="A wrong answer costs more than no answer."
      intro="When the best match is too weak, CiteDesk stops before the model writes anything and points you to the nearest section instead."
    >
      <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <figure className="rounded-3xl border border-line bg-card p-5 shadow-(--shadow) sm:p-8">
          <figcaption>
            <SampleLabel />
          </figcaption>
          <p className="mt-5 ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-surface px-4 py-2.5 text-[0.9375rem]">
            {SAMPLE_REFUSAL.question}
          </p>
          <div className="mt-5 flex gap-4">
            <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-6 shrink-0 text-ink-2" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <circle cx="12" cy="16.8" r="1" fill="currentColor" />
            </svg>
            <div>
              <p className="text-xl font-semibold tracking-[-0.015em]">I don’t know.</p>
              <p className="mt-1 text-ink-2">The docs I can search don’t cover this.</p>
              <div className="mt-5 rounded-xl bg-surface px-4 py-3">
                <p className="text-xs font-medium text-ink-2">Closest section</p>
                <p className="mt-1 font-mono text-sm">{SAMPLE_REFUSAL.closest.headingPath.join(" › ")}</p>
              </div>
              <p className="mt-4 text-sm text-ink-2">It scored below the confidence threshold, so no answer was written.</p>
            </div>
          </div>
        </figure>
        <ul className="space-y-5">
          {POINTS.map((p) => (
            <li key={p} className="flex gap-3">
              <svg aria-hidden viewBox="0 0 20 20" className="mt-1 size-5 shrink-0 text-accent" fill="none">
                <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-pretty">{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
