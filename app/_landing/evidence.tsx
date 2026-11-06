import { CONFIG_LABELS, formatMs, formatPoints, formatUsd, type EvidenceRow } from "@/lib/evidence";
import { loadEvidence } from "./evidence-data";
import { Section, stagger } from "./ui";

const CONFIGS = [
  { id: "vector", planned: "week 2" },
  { id: "hybrid", planned: "week 3" },
  { id: "hybrid-rerank", planned: "week 3" },
];
const COLUMNS: { label: string; value: (r: EvidenceRow) => string }[] = [
  { label: "Recall@5", value: (r) => formatPoints(r.recallAt5) },
  { label: "MRR", value: (r) => formatPoints(r.mrr) },
  { label: "Cost / query", value: (r) => formatUsd(r.costPerQueryUsd) },
  { label: "p95 latency", value: (r) => formatMs(r.p95LatencyMs) },
];

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
  const rows = new Map(evidence.status === "measured" ? evidence.summary.rows.map((r) => [r.config, r]) : []);
  const questionCount = evidence.status === "measured" ? evidence.summary.questionCount : evidence.questionCount;

  return (
    <Section
      id="evidence"
      tone="surface"
      eyebrow="Evidence"
      title="Numbers, not adjectives."
      intro={
        evidence.status === "measured"
          ? "Every figure here comes from an eval run file in the repo, the same file the README table is generated from. Recall and MRR are in points (×100)."
          : "Every figure here will come from an eval run file in the repo, the same file the README table is generated from. No runs on the full question set exist yet, so nothing is shown."
      }
    >
      <>
          {/* Outside the horizontal scroller on purpose: .table-scope gives the rows a timeline they can follow. */}
          <div className="table-scope">
            <div
              role="region"
              aria-label="Retrieval ablation table"
              tabIndex={0}
              className="overflow-x-auto rounded-2xl border border-line bg-card"
            >
              <table className="w-full min-w-150 text-left text-sm">
                <caption className="sr-only">
                  {evidence.status === "measured"
                    ? `Retrieval ablation on ${questionCount} labelled questions. Configurations without a run show Pending.`
                    : "Retrieval ablation on 40 labelled questions. All results pending: no eval runs on the full set exist yet."}
                </caption>
                <thead>
                  <tr className="border-b border-line text-ink-2">
                    <th scope="col" className="px-5 py-4 font-medium">
                      Configuration
                    </th>
                    {COLUMNS.map((c) => (
                      <th key={c.label} scope="col" className="px-5 py-4 text-right font-medium">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CONFIGS.map((config, i) => {
                    const measured = rows.get(config.id);
                    return (
                      <tr key={config.id} style={stagger(i)} className="reveal-row border-b border-line last:border-0">
                        <th scope="row" className="px-5 py-4 font-medium">
                          {CONFIG_LABELS[config.id]}
                          <span className="mt-0.5 block text-xs font-normal text-ink-2">
                            {measured ? `Run ${measured.runDate}` : `Planned: ${config.planned}`}
                          </span>
                        </th>
                        {COLUMNS.map((c) => (
                          <td key={c.label} className="px-5 py-4 text-right font-mono tabular-nums">
                            {measured ? c.value(measured) : <Pending />}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {TARGETS.map((t, i) => (
              <div key={t.label} style={stagger(i)} className="reveal rounded-2xl border border-line bg-card p-6">
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
            {evidence.status === "measured"
              ? `Measured on ${questionCount} hand-labelled questions, each labelled with the sections that should be found.`
              : "The retrieval set is 40 questions, each labelled with the sections that should be found. It is being written now."}{" "}
            The generation set adds 10 questions the docs can’t answer, to measure refusals.
          </p>
        </>
    </Section>
  );
}
