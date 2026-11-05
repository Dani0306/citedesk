import { Section } from "./ui";

const FAQ = [
  {
    q: "Which docs does it answer from?",
    a: "One public documentation set, checked for its licence before anything is ingested. It will be named here, with the exact version used, once it’s ingested.",
  },
  {
    q: "What happens when it doesn’t know?",
    a: "If the best-matching section is too weak, it says “I don’t know” and shows the closest section, so you still know where to look. That decision is made in code before any answer is written.",
  },
  {
    q: "Are my questions used for training?",
    a: "CiteDesk trains nothing. To write an answer, the question and the retrieved passages are sent to OpenAI’s API, under OpenAI’s API data terms. The demo has no accounts and asks for no personal details; questions are logged to measure answer quality.",
  },
  {
    q: "What does an answer cost?",
    a: "Every model call’s tokens and cost are logged. The measured cost per answer will appear in the Evidence section; until it’s measured there’s no number to show.",
  },
  {
    q: "Which languages does it support?",
    a: "English docs and questions for now. Asking in Spanish about English docs is planned for after launch.",
  },
];

export function Faq() {
  return (
    <Section id="faq" eyebrow="FAQ" title="Before you ask.">
      <div className="max-w-3xl divide-y divide-line border-y border-line">
        {FAQ.map((item) => (
          <details key={item.q} className="group">
            <summary className="press flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-medium tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
              {item.q}
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                className="size-5 shrink-0 text-ink-2 transition-transform duration-200 ease-out group-open:rotate-180 motion-reduce:transition-none"
                fill="none"
              >
                <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p className="pb-6 text-pretty text-ink-2">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
