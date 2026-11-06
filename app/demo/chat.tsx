"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import type { CiteMessage } from "@/lib/answer/ui-message";
import { AnswerBody } from "./answer";
import { RefusalCard } from "./refusal";
import { MAX_QUESTION_CHARS, SAMPLE_QUESTIONS } from "./samples";
import { SourceList, type SourceItem } from "./sources";

// The demo's only client island (T29–T31). Each question is answered on its own: the transport
// sends just the new question, never the history. Everything rendered comes from message.parts.

const textOf = (m: CiteMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

const transport = new DefaultChatTransport<CiteMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages }) => ({ body: { question: textOf(messages[messages.length - 1]) } }),
});

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function AssistantTurn({ message, streaming }: { message: CiteMessage; streaming: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const cards = useRef(new Map<number, HTMLLIElement>());

  const passages = new Map<number, string>();
  const sources: SourceItem[] = [];
  let citations: Set<number> | null = null;
  let refusal = null;
  for (const p of message.parts) {
    if (p.type === "data-passage") passages.set(p.data.n, p.data.snippet);
    if (p.type === "data-citations") citations = new Set(p.data.cited);
    if (p.type === "data-refusal") refusal = p.data;
  }
  for (const p of message.parts) {
    if (p.type === "source-url") {
      const n = Number(p.sourceId);
      sources.push({ n, title: p.title ?? p.url, url: p.url, snippet: passages.get(n) ?? "" });
    }
  }

  if (refusal) return <RefusalCard data={refusal} />;

  const titles = new Map(sources.map((s) => [s.n, s.title]));
  const text = textOf(message);
  const cite = (n: number) => {
    setActive(n);
    const card = cards.current.get(n);
    card?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    card?.focus({ preventScroll: true });
  };

  return (
    <div aria-busy={streaming}>
      {text ? (
        <AnswerBody text={text} titles={titles} active={active} onCite={cite} />
      ) : (
        <p className="text-ink-2">{sources.length ? "Writing the answer…" : "Searching the docs…"}</p>
      )}
      {sources.length ? (
        <SourceList
          idPrefix={message.id}
          sources={sources}
          cited={citations}
          active={active}
          cardRef={(n) => (el) => {
            if (el) cards.current.set(n, el);
            else cards.current.delete(n);
          }}
        />
      ) : null}
    </div>
  );
}

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, stop, error, regenerate } = useChat<CiteMessage>({ transport });
  const busy = status === "submitted" || status === "streaming";
  const latestTurn = useRef<HTMLLIElement>(null);
  const tooLong = input.length > MAX_QUESTION_CHARS;

  const ask = (question: string) => {
    const q = question.trim();
    if (!q || busy || q.length > MAX_QUESTION_CHARS) return;
    void sendMessage({ text: q });
    setInput("");
  };

  // Bring each new question into view.
  useEffect(() => {
    latestTurn.current?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [messages.length]);

  // Announced once the answer is complete, never token by token.
  const last = messages.at(-1);
  const announcement =
    status === "ready" && last?.role === "assistant"
      ? last.parts.some((p) => p.type === "data-refusal")
        ? "I don't know. The closest section is shown."
        : `Answer ready, with ${last.parts.filter((p) => p.type === "source-url").length} sources listed below it.`
      : "";

  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <ol className="space-y-8">
        {messages.map((m, i) => (
          <li key={m.id} ref={i === messages.length - 1 ? latestTurn : undefined} className="scroll-mt-24">
            {m.role === "user" ? (
              <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-surface px-4 py-2.5 text-[0.9375rem] [overflow-wrap:anywhere]">
                {textOf(m)}
              </p>
            ) : (
              <AssistantTurn message={m} streaming={busy && i === messages.length - 1} />
            )}
          </li>
        ))}
        {status === "submitted" && messages.at(-1)?.role === "user" ? (
          <li>
            <p className="text-ink-2">Searching the docs…</p>
          </li>
        ) : null}
      </ol>

      {error ? (
        <div role="alert" className="mt-6 rounded-2xl border border-line bg-card p-4 text-[0.9375rem]">
          <p>{error.message || "Something went wrong while answering. Please try again."}</p>
          <button
            type="button"
            onClick={() => void regenerate()}
            className="press mt-3 inline-flex min-h-9 items-center rounded-full border border-line px-4 text-sm font-medium hover:bg-surface"
          >
            Try again
          </button>
        </div>
      ) : null}

      <div className="sticky bottom-0 -mx-4 mt-8 border-t border-line bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-t-2xl sm:border-x">
        <p id="samples-label" className="text-xs font-medium text-ink-2">
          Try a sample question
        </p>
        <div role="group" aria-labelledby="samples-label" className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {SAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => ask(q)}
              className="press shrink-0 rounded-full border border-line bg-card px-3.5 py-1.5 text-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-45"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <label htmlFor="question" className="sr-only">
            Your question about the Supabase Database or AI docs
          </label>
          <textarea
            id="question"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                ask(input);
              }
            }}
            aria-describedby="question-hint"
            aria-invalid={tooLong}
            placeholder="Ask about Postgres, indexes, RLS, pgvector…"
            className="max-h-40 min-h-11 w-full min-w-0 flex-1 resize-none rounded-2xl border border-line bg-card px-4 py-2.5 text-[0.9375rem] field-sizing-content placeholder:text-ink-2"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => void stop()}
              className="press inline-flex min-h-11 items-center rounded-full border border-line px-5 text-[0.9375rem] font-medium hover:bg-surface"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || tooLong}
              className="press inline-flex min-h-11 items-center rounded-full bg-accent-strong px-5 text-[0.9375rem] font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
            >
              Ask
            </button>
          )}
        </form>
        <p id="question-hint" className={`mt-1.5 text-xs ${tooLong ? "font-medium text-ink" : "text-ink-2"}`}>
          {tooLong
            ? `That's ${input.length.toLocaleString("en-US")} characters; the limit is ${MAX_QUESTION_CHARS.toLocaleString("en-US")}.`
            : "Each question is answered on its own, only from the docs. Enter to send, Shift+Enter for a new line."}
        </p>
      </div>
    </div>
  );
}
