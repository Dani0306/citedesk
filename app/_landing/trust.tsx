import { IconCitation, IconCost, IconGate, IconRefusal, IconTile } from "./illustrations";
import { Section, stagger } from "./ui";

const RULES = [
  {
    icon: IconCitation,
    title: "Citations checked in code",
    body: "Every [n] must point at a passage retrieved for that question. A marker that doesn’t is counted as a hallucinated citation.",
  },
  {
    icon: IconRefusal,
    title: "Refusal before generation",
    body: "A weak retrieval score stops the request before the model writes anything.",
  },
  {
    icon: IconCost,
    title: "Every model call costed",
    body: "Tokens, cost and latency are logged for each call, from the provider’s own usage numbers, never estimates.",
  },
  {
    icon: IconGate,
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
        {RULES.map((r, i) => (
          <li key={r.title} style={stagger(i)} className="reveal border-t border-line pt-6">
            <IconTile>
              <r.icon />
            </IconTile>
            <h3 className="mt-4 text-lg font-semibold tracking-[-0.01em]">{r.title}</h3>
            <p className="mt-2 text-[0.9375rem] text-pretty text-ink-2">{r.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
