import { describe, expect, it } from "vitest";
import { checkAnswerStream, checkRefusalStream, isNoindex, ogImage, parseSse, type SseEvent } from "@/lib/answer/stream-check";

const e = (type: string, extra: Record<string, unknown> = {}): SseEvent => ({ type, ...extra });
const source = (n: number) => [e("source-url", { sourceId: String(n), url: "https://supabase.com/x" }), e("data-passage", { data: { n } })];
const good = (): SseEvent[] => [
  e("start"),
  ...source(1),
  ...source(2),
  e("text-start"),
  e("text-delta", { delta: "Use a where clause [1]." }),
  e("text-end"),
  e("data-citations", { data: { cited: [1], invalid: [], uncitedSentences: 0 } }),
  e("finish"),
];

describe("parseSse", () => {
  it("reads data lines as JSON and skips the DONE sentinel", () => {
    const body = 'data: {"type":"start"}\n\ndata: {"type":"text-delta","delta":"Hi"}\n\ndata: [DONE]\n\n';
    expect(parseSse(body)).toEqual([{ type: "start" }, { type: "text-delta", delta: "Hi" }]);
  });
});

describe("checkAnswerStream", () => {
  it("accepts a stream with sources first and the citation check last", () => {
    expect(checkAnswerStream(good())).toEqual({ ok: true, problems: [] });
  });

  it("rejects a source that arrives after the first token", () => {
    const events = good();
    events.splice(events.length - 3, 0, ...source(3));
    expect(checkAnswerStream(events).problems).toContain("a source arrived after the first token");
  });

  it("rejects a missing or early citation check, an invalid marker, and an answer that cites nothing", () => {
    expect(checkAnswerStream(good().filter((x) => x.type !== "data-citations")).problems).toContain("no data-citations part");
    const early = good();
    const [citations] = early.splice(early.length - 2, 1);
    early.splice(4, 0, citations);
    expect(checkAnswerStream(early).problems).toContain("data-citations arrived before the text ended");
    const bad = good();
    bad[bad.length - 2] = e("data-citations", { data: { cited: [1], invalid: [9], uncitedSentences: 0 } });
    expect(checkAnswerStream(bad).problems).toContain("hallucinated citation markers: 9");
    const none = good();
    none[none.length - 2] = e("data-citations", { data: { cited: [], invalid: [], uncitedSentences: 1 } });
    expect(checkAnswerStream(none).problems).toContain("the answer cites nothing");
  });

  it("rejects a refusal, an error part, and a stream that was cut short", () => {
    expect(checkAnswerStream([...good(), e("data-refusal", { data: {} })]).problems).toContain("an answerable question was refused");
    expect(checkAnswerStream([...good().slice(0, -1), e("error", { errorText: "x" }), e("finish")]).problems).toContain("the stream carries an error part");
    expect(checkAnswerStream(good().slice(0, -1)).problems).toContain("the stream does not end with `finish`");
  });
});

describe("checkRefusalStream", () => {
  const refusal = (): SseEvent[] => [
    e("start"),
    e("text-start"),
    e("text-delta", { delta: "I don't know." }),
    e("text-end"),
    e("data-refusal", { data: { reason: "low_score", closest: { title: "T", url: "https://supabase.com/x", snippet: "s", similarity: 0.4 } } }),
    e("finish"),
  ];

  it("accepts a short refusal with the closest section", () => {
    expect(checkRefusalStream(refusal())).toEqual({ ok: true, problems: [] });
  });

  it("rejects a refusal that streams sources or an answer, or has no closest section", () => {
    expect(checkRefusalStream([...refusal().slice(0, 1), ...source(1), ...refusal().slice(1)]).problems).toContain("a refused question streamed sources");
    const talky = refusal();
    talky[2] = e("text-delta", { delta: "Probably this: ..." });
    expect(checkRefusalStream(talky).problems.join()).toMatch(/streamed text other than/);
    const bare = refusal();
    bare[4] = e("data-refusal", { data: { reason: "no_matches", closest: null } });
    expect(checkRefusalStream(bare).problems).toContain("the refusal has no closest section");
  });
});

describe("page checks", () => {
  it("finds the og:image URL and the noindex flag", () => {
    const html = '<head><meta property="og:image" content="https://citedesk.vercel.app/opengraph-image?x=1"/><meta name="robots" content="noindex, nofollow"/></head>';
    expect(ogImage(html)).toBe("https://citedesk.vercel.app/opengraph-image?x=1");
    expect(isNoindex(html)).toBe(true);
    expect(isNoindex('<meta name="robots" content="index, follow"/>')).toBe(false);
    expect(ogImage("<head></head>")).toBeNull();
  });
});
