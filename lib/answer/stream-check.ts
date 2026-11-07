// The checks behind `npm run smoke:live` (T43): does a /api/chat stream have the shape the UI and
// the product promise depend on? Sources before the first token, the citation check last, a refusal
// that never streams an answer. Pure, so it is tested without a server.

export type SseEvent = { type: string; [key: string]: unknown };
export type CheckResult = { ok: boolean; problems: string[] };

/** The JSON events of a text/event-stream body (the `data: [DONE]` sentinel is skipped). */
export function parseSse(body: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of body.split(/\n\n+/)) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!data || data === "[DONE]") continue;
    events.push(JSON.parse(data) as SseEvent);
  }
  return events;
}

const result = (problems: string[]): CheckResult => ({ ok: problems.length === 0, problems });
const indexOfLast = (events: SseEvent[], pred: (e: SseEvent) => boolean) => events.findLastIndex(pred);
const textOf = (events: SseEvent[]) => events.filter((e) => e.type === "text-delta").map((e) => String(e.delta ?? "")).join("");

/** An answerable question: sources first, then text, then `data-citations` last, with no invalid marker. */
export function checkAnswerStream(events: SseEvent[]): CheckResult {
  const problems: string[] = [];
  if (events[0]?.type !== "start") problems.push("the stream does not begin with `start`");
  if (events.at(-1)?.type !== "finish") problems.push("the stream does not end with `finish`");
  if (events.some((e) => e.type === "error")) problems.push("the stream carries an error part");
  if (events.some((e) => e.type === "data-refusal")) problems.push("an answerable question was refused");

  const sources = events.filter((e) => e.type === "source-url");
  if (sources.length === 0) problems.push("no source-url parts");
  sources.forEach((s, i) => {
    if (s.sourceId !== String(i + 1)) problems.push(`source ${i + 1} has sourceId ${String(s.sourceId)}`);
  });
  const passages = events.filter((e) => e.type === "data-passage");
  if (passages.length !== sources.length) problems.push(`${sources.length} sources but ${passages.length} passages`);

  const firstText = events.findIndex((e) => e.type === "text-delta");
  if (firstText === -1) problems.push("no answer text was streamed");
  else if (indexOfLast(events, (e) => e.type === "source-url" || e.type === "data-passage") > firstText) problems.push("a source arrived after the first token");

  const citations = events.findLast((e) => e.type === "data-citations");
  if (!citations) problems.push("no data-citations part");
  else {
    const data = citations.data as { cited?: number[]; invalid?: number[] } | undefined;
    if (events.findIndex((e) => e === citations) < indexOfLast(events, (e) => e.type === "text-delta")) problems.push("data-citations arrived before the text ended");
    if ((data?.invalid ?? []).length > 0) problems.push(`hallucinated citation markers: ${(data?.invalid ?? []).join(", ")}`);
    if ((data?.cited ?? []).length === 0) problems.push("the answer cites nothing");
  }
  return result(problems);
}

/** A question outside the corpus: a refusal part with the closest section, and no answer streamed. */
export function checkRefusalStream(events: SseEvent[]): CheckResult {
  const problems: string[] = [];
  if (events[0]?.type !== "start") problems.push("the stream does not begin with `start`");
  if (events.at(-1)?.type !== "finish") problems.push("the stream does not end with `finish`");
  const refusal = events.find((e) => e.type === "data-refusal");
  if (!refusal) problems.push("no data-refusal part");
  else if (!(refusal.data as { closest?: unknown } | undefined)?.closest) problems.push("the refusal has no closest section");
  if (events.some((e) => e.type === "source-url")) problems.push("a refused question streamed sources");
  const text = textOf(events);
  if (text.trim() !== "I don't know.") problems.push(`a refusal streamed text other than "I don't know.": ${JSON.stringify(text.slice(0, 60))}`);
  return result(problems);
}

/** The absolute og:image URL in a page, or null. */
export function ogImage(html: string): string | null {
  const tag = html.match(/<meta[^>]+property=["']og:image["'][^>]*>/i)?.[0];
  return tag?.match(/content=["']([^"']+)["']/i)?.[1] ?? null;
}

/** Whether the page asks not to be indexed. */
export function isNoindex(html: string): boolean {
  const tag = html.match(/<meta[^>]+name=["']robots["'][^>]*>/i)?.[0] ?? "";
  return /noindex/i.test(tag);
}
