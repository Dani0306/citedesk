"use client";

import { useRef, useState } from "react";
import type { PlaygroundRow, PlaygroundView } from "@/lib/answer/playground";
import { AnswerBody } from "../demo/answer";
import { MAX_QUESTION_CHARS } from "../demo/samples";

// The retrieval playground's only client island (T42). One question at a time: the server returns
// every candidate's rank at each stage, and the table shows how the pool became the chunks the
// model saw, and which of those the answer cited.

const SAMPLES = ["When should I pick HNSW over IVFFlat?", "How do I stop the auto-generated API from handing out every row of a new table?", "How do I create a partial index?"];

const rank = (n: number | null) => (n === null ? "–" : String(n));
const pct = (x: number) => x.toFixed(3);

function Badge({ on, children }: { on: boolean; children: string }) {
  return on ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">{children}</span> : <span className="text-xs text-ink-2">–</span>;
}

function Rows({ rows, active, refFor }: { rows: PlaygroundRow[]; active: number | null; refFor: (n: number | null) => (el: HTMLElement | null) => void }) {
  return (
    <>
      {/* Phones: one card per candidate. */}
      <ol className="space-y-3 sm:hidden">
        {rows.map((r) => (
          <li
            key={r.chunkKey + r.poolRank}
            ref={refFor(r.sentAs)}
            tabIndex={-1}
            className={`rounded-2xl border p-4 ${active !== null && r.sentAs === active ? "border-accent bg-card shadow-(--shadow)" : "border-line bg-card/60"}`}
          >
            <p className="font-mono text-xs text-ink-2 [overflow-wrap:anywhere]">{r.title}</p>
            <p className="mt-2 font-mono text-xs">
              pool {r.poolRank} · vector {rank(r.vectorRank)} · keyword {rank(r.keywordRank)} · rerank {rank(r.rerankRank)} · sim {pct(r.similarity)}
            </p>
            <p className="mt-2 flex gap-2">
              {r.sentAs !== null ? <Badge on>{`Sent as [${r.sentAs}]`}</Badge> : <span className="text-xs text-ink-2">Not sent</span>}
              {r.cited ? <Badge on>Cited</Badge> : null}
            </p>
          </li>
        ))}
      </ol>
      {/* Wider screens: the stages side by side. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-card sm:block" role="region" aria-label="Candidates" tabIndex={0}>
        <table className="w-full min-w-170 text-left text-sm">
          <caption className="sr-only">Every candidate with its rank in each retrieval stage, whether it was sent to the answer model, and whether it was cited.</caption>
          <thead>
            <tr className="border-b border-line text-ink-2">
              <th scope="col" className="px-4 py-3 font-medium">Pool</th>
              <th scope="col" className="px-4 py-3 font-medium">Section</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Similarity</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Vector</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Keyword</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Rerank</th>
              <th scope="col" className="px-4 py-3 font-medium">Sent</th>
              <th scope="col" className="px-4 py-3 font-medium">Cited</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.chunkKey + r.poolRank}
                ref={refFor(r.sentAs)}
                tabIndex={-1}
                className={`border-b border-line last:border-0 ${active !== null && r.sentAs === active ? "bg-accent-soft" : r.sentAs === null ? "text-ink-2" : ""}`}
              >
                <td className="px-4 py-2.5 font-mono tabular-nums">{r.poolRank}</td>
                <td className="max-w-80 px-4 py-2.5">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline [overflow-wrap:anywhere]">
                    {r.title}
                  </a>
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{pct(r.similarity)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{rank(r.vectorRank)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{rank(r.keywordRank)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{rank(r.rerankRank)}</td>
                <td className="px-4 py-2.5">{r.sentAs !== null ? <Badge on>{`[${r.sentAs}]`}</Badge> : <Badge on={false}>–</Badge>}</td>
                <td className="px-4 py-2.5">
                  <Badge on={r.cited}>Cited</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Playground() {
  const [question, setQuestion] = useState("");
  const [retrieval, setRetrieval] = useState<"vector" | "hybrid">("hybrid");
  const [rerank, setRerank] = useState(true);
  const [view, setView] = useState<PlaygroundView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const rows = useRef(new Map<number, HTMLElement>());

  const run = async (q: string) => {
    const text = q.trim();
    if (!text || busy || text.length > MAX_QUESTION_CHARS) return;
    setQuestion(text);
    setBusy(true);
    setError(null);
    setActive(null);
    try {
      const res = await fetch("/api/playground", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: text, retrieval, rerank }) });
      if (!res.ok) throw new Error((await res.text()) || "Something went wrong. Please try again.");
      setView((await res.json()) as PlaygroundView);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const titles = new Map((view?.rows ?? []).filter((r) => r.sentAs !== null).map((r) => [r.sentAs!, r.title]));
  const refFor = (n: number | null) => (el: HTMLElement | null) => {
    // Phones and the table both render; keep whichever is visible.
    if (n === null || !el || el.offsetParent === null) return;
    rows.current.set(n, el);
  };

  return (
    <div>
      <form
        className="space-y-4 rounded-2xl border border-line bg-card p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(question);
        }}
      >
        <label htmlFor="pg-question" className="text-sm font-medium">
          Question
        </label>
        <textarea
          id="pg-question"
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="block w-full min-w-0 resize-y rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[0.9375rem]"
          placeholder="Ask about Postgres, indexes, RLS, pgvector…"
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <fieldset className="flex items-center gap-4">
            <legend className="sr-only">Retrieval</legend>
            {(["vector", "hybrid"] as const).map((r) => (
              <label key={r} className="inline-flex items-center gap-2">
                <input type="radio" name="retrieval" value={r} checked={retrieval === r} onChange={() => setRetrieval(r)} />
                {r === "vector" ? "Vector only" : "Hybrid (vector + full-text)"}
              </label>
            ))}
          </fieldset>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={rerank} onChange={(e) => setRerank(e.target.checked)} />
            LLM rerank (top 50 → 8)
          </label>
          <button
            type="submit"
            disabled={busy || !question.trim() || question.length > MAX_QUESTION_CHARS}
            className="press ml-auto inline-flex min-h-11 items-center rounded-full bg-accent-strong px-5 font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? "Running…" : "Run"}
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Sample questions">
          {SAMPLES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => void run(s)}
              className="press shrink-0 rounded-full border border-line px-3.5 py-1.5 text-sm hover:bg-surface disabled:opacity-45"
            >
              {s}
            </button>
          ))}
        </div>
      </form>

      <div aria-live="polite" aria-busy={busy} className="mt-8 space-y-6">
        {error ? (
          <p role="alert" className="rounded-2xl border border-line bg-card p-4">
            {error}
          </p>
        ) : null}
        {view ? (
          <>
            <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
              <p>
                <span className="font-medium">Gate:</span> top vector similarity {view.gate.topVectorSimilarity?.toFixed(3) ?? "–"} against a threshold of {view.gate.threshold} (
                {view.gate.thresholdSource}) → {view.gate.refused ? `refused (${view.gate.reason})` : "answered"}.
              </p>
              <p className="mt-1">
                <span className="font-medium">Rerank:</span> {view.rerank.status}
                {view.rerank.note ? ` · ${view.rerank.note}` : ""} · cost ${view.costUsd.toFixed(6)} · {view.latencyMs.toLocaleString("en-US")} ms
              </p>
            </div>
            <Rows rows={view.rows} active={active} refFor={refFor} />
            {view.answer ? (
              <section aria-label="Answer" className="rounded-2xl border border-line bg-card p-5">
                <h2 className="text-sm font-medium text-ink-2">Answer · click a citation to find its row</h2>
                <div className="mt-3">
                  <AnswerBody
                    text={view.answer}
                    titles={titles}
                    active={active}
                    onCite={(n) => {
                      setActive(n);
                      const el = rows.current.get(n);
                      el?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
                      el?.focus({ preventScroll: true });
                    }}
                  />
                </div>
                {view.invalidMarkers.length ? <p className="mt-3 text-sm text-ink-2">Markers pointing at no sent chunk: {view.invalidMarkers.map((n) => `[${n}]`).join(" ")}</p> : null}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
