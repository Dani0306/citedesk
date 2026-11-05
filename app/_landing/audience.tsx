import { Badge, Section } from "./ui";

const AUDIENCES = [
  {
    title: "Support and ops teams",
    body: "Answer the repeat question once, with the link that proves it, instead of rewriting it from memory.",
  },
  {
    title: "New hires and students",
    body: "Find the rule or the step without knowing what the page is called.",
  },
  {
    title: "Developer-docs teams",
    body: "Questions phrased the way your users phrase them, answered in your docs’ own words.",
  },
];

export function Audience() {
  return (
    <Section id="who" eyebrow="Who it’s for" title="For anyone who answers the same question twice.">
      <div className="grid gap-4 md:grid-cols-3">
        {AUDIENCES.map((a) => (
          <article key={a.title} className="rounded-3xl border border-line bg-card p-6 sm:p-7">
            <h3 className="text-lg font-semibold tracking-[-0.01em]">{a.title}</h3>
            <p className="mt-3 text-[0.9375rem] text-pretty text-ink-2">{a.body}</p>
          </article>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 rounded-3xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <p className="text-pretty">
          <span className="font-semibold">For agencies:</span>{" "}
          <span className="text-ink-2">an “ask our docs” widget you can hand to a client, with sources they can audit.</span>
        </p>
        <Badge>Planned</Badge>
      </div>
    </Section>
  );
}
