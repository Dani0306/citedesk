import { Section } from "./ui";

const RULES = [
  {
    title: "Citations checked in code",
    body: "Every [n] must point at a passage retrieved for that question. A marker that doesn’t is counted as a hallucinated citation.",
  },
  {
    title: "Refusal before generation",
    body: "A weak retrieval score stops the request before the model writes anything.",
  },
  {
    title: "Every model call costed",
    body: "Tokens, cost and latency are logged for each call, from the provider’s own usage numbers, never estimates.",
  },
  {
    title: "A regression gate in CI",
    body: "Pull requests run the eval suite and fail if a headline metric drops more than 2 points below the committed baseline.",
  },
];

export function Trust() {
  return (
    <Section
      id="trust"
      tone="surface"
      eyebrow="Built to be trusted"
      title="Rules the code enforces."
      intro="These are the rules CiteDesk is being built to. The Evidence section shows which ones are measured so far."
    >
      <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {RULES.map((r) => (
          <li key={r.title} className="border-t border-line pt-6">
            <h3 className="text-lg font-semibold tracking-[-0.01em]">{r.title}</h3>
            <p className="mt-2 text-[0.9375rem] text-pretty text-ink-2">{r.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
