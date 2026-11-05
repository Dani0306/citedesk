import { loadEvidence } from "./evidence-data";
import { Section } from "./ui";

const CONFIGS = [
  { name: "Naive vector", planned: "week 2" },
  { name: "Hybrid (vector + full-text, RRF)", planned: "week 3" },
  { name: "Hybrid + rerank", planned: "week 3" },
];
const COLUMNS = ["Recall@5", "MRR", "Cost / query", "p95 latency"];

const TARGETS = [
  {
    label: "Hallucinated citations",
    target: "Target: 0",
    note: "A marker that points at a passage not retrieved for that question. Checked in code on every answer.",
  },
  {
    label: "Judge agreement",
    target: "Target: ≥ 85%",
    note: "The groundedness judge against 30 hand-labelled answers, with Cohen’s kappa alongside. Planned for week 4.",
  },
];

function Pending() {
  return <span className="text-ink-2">Pending</span>;
}

export function Evidence() {
  const evidence = loadEvidence();

  return (
    <Section
      id="evidence"
      tone="surface"
      eyebrow="Evidence"
      title="Numbers, not adjectives."
      intro="Every figure here will come from an eval run file in the repo, the same file the README table is generated from. No runs exist yet, so nothing is shown."
    >
      {evidence.status === "pending" ? (
        <>
          <div
            role="region"
            aria-label="Retrieval ablation table"
            tabIndex={0}
            className="overflow-x-auto rounded-2xl border border-line bg-card"
          >
            <table className="w-full min-w-150 text-left text-sm">
              <caption className="sr-only">
                Retrieval ablation on 40 labelled questions. All results pending: no eval runs exist yet.
              </caption>
              <thead>
                <tr className="border-b border-line text-ink-2">
                  <th scope="col" className="px-5 py-4 font-medium">
                    Configuration
                  </th>
                  {COLUMNS.map((c) => (
                    <th key={c} scope="col" className="px-5 py-4 text-right font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CONFIGS.map((row) => (
                  <tr key={row.name} className="border-b border-line last:border-0">
                    <th scope="row" className="px-5 py-4 font-medium">
                      {row.name}
                      <span className="mt-0.5 block text-xs font-normal text-ink-2">Planned: {row.planned}</span>
                    </th>
                    {COLUMNS.map((c) => (
                      <td key={c} className="px-5 py-4 text-right font-mono tabular-nums">
                        <Pending />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {TARGETS.map((t) => (
              <div key={t.label} className="rounded-2xl border border-line bg-card p-6">
                <p className="text-sm font-medium text-ink-2">{t.label}</p>
                <p className="mt-2 font-mono text-4xl font-medium tracking-[-0.02em] text-ink-2">
                  <span aria-hidden>—</span>
                  <span className="sr-only">Not measured yet</span>
                </p>
                <p className="mt-2 text-sm font-medium">{t.target}</p>
                <p className="mt-2 text-sm text-pretty text-ink-2">{t.note}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 max-w-2xl text-sm text-pretty text-ink-2">
            The retrieval set is 40 questions, each labelled with the sections that should be found. It is being written
            now. The generation set adds 10 questions the docs can’t answer, to measure refusals.
          </p>
        </>
      ) : null}
    </Section>
  );
}
