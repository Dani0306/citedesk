// The closest wording to a cited sentence (T44). Clicking a citation marker marks the unit of the
// source passage (a sentence, a list item or a code block) that shares the most words with the
// sentence that cited it. It is a pointer, not a proof: whether the passage actually supports the
// sentence is the judge's job (T36), so a weak match is never marked. Pure and deterministic, no
// model call; the segments always concatenate back to the passage, so nothing is hidden or altered.

export type Segment = { text: string; kind: "prose" | "code"; marked: boolean };
export type Highlight = {
  segments: Segment[];
  /** False when no unit shares enough words: the whole passage is the source, and nothing is marked. */
  matched: boolean;
};

/** A unit must hold at least this share of the claim's (length-weighted) words, and 2 distinct words. */
export const MIN_SCORE = 0.2;
export const MIN_SHARED_WORDS = 2;
/** Other units within this fraction of the best score are marked too, up to MAX_MARKED in all. */
const NEAR_BEST = 0.8;
const MAX_MARKED = 2;

const STOPWORDS = new Set(
  "the and for are but not you your with that this from have has had was were will would can could should may might its into than then them they their there here what when which who how why also any all one use used uses using per via out off our ours let get got".split(" "),
);

function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(sses|xes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

/** Lowercased words and identifiers (create_index stays whole), minus stopwords and 1–2 letter tokens, lightly stemmed. */
export function words(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z0-9_]+/g) ?? []) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    out.add(stem(raw));
  }
  return out;
}

const weight = (word: string) => Math.min(word.length, 8);

type Unit = { start: number; end: number; kind: Segment["kind"] };

const FENCED = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\1[^\n]*|(?![\s\S]))/gm;
const SENTENCE_GAP = /(?<=[.!?])\s+(?=[A-Z`([“"'])/g;

/** Non-overlapping units in order: each fenced block whole, every other line split into sentences. */
export function splitUnits(passage: string): Unit[] {
  const units: Unit[] = [];
  const prose = (from: number, to: number) => {
    const text = passage.slice(from, to);
    for (const line of text.matchAll(/[^\n]*\S[^\n]*/g)) {
      const base = from + line.index;
      const lineText = line[0];
      let cursor = 0;
      for (const gap of lineText.matchAll(SENTENCE_GAP)) {
        units.push({ start: base + cursor, end: base + gap.index, kind: "prose" });
        cursor = gap.index + gap[0].length;
      }
      units.push({ start: base + cursor, end: base + lineText.trimEnd().length, kind: "prose" });
    }
  };
  let cursor = 0;
  for (const fence of passage.matchAll(FENCED)) {
    prose(cursor, fence.index);
    units.push({ start: fence.index, end: fence.index + fence[0].length, kind: "code" });
    cursor = fence.index + fence[0].length;
  }
  prose(cursor, passage.length);
  return units;
}

/** A fenced block as a reader sees it: the code between the fence lines. Display only; matching uses the whole block. */
export function codeBody(block: string): string {
  return block.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n/, "").replace(/\n {0,3}(`{3,}|~{3,})[ \t]*$/, "");
}

export function highlightPassage(passage: string, claim: string): Highlight {
  const claimWords = words(claim);
  const total = [...claimWords].reduce((sum, w) => sum + weight(w), 0);
  const units = splitUnits(passage);

  const scored = units.map((unit, index) => {
    const unitWords = words(passage.slice(unit.start, unit.end));
    const shared = [...claimWords].filter((w) => unitWords.has(w));
    return { index, shared: shared.length, score: total ? shared.reduce((sum, w) => sum + weight(w), 0) / total : 0 };
  });

  const best = scored.reduce((top, s) => (s.score > top.score ? s : top), { index: -1, shared: 0, score: 0 });
  const matched = best.index !== -1 && best.score >= MIN_SCORE && best.shared >= MIN_SHARED_WORDS;
  const marked = new Set(
    matched
      ? scored
          .filter((s) => s.shared >= MIN_SHARED_WORDS && s.score >= best.score * NEAR_BEST && s.score >= MIN_SCORE)
          .sort((a, b) => b.score - a.score || a.index - b.index)
          .slice(0, MAX_MARKED)
          .map((s) => s.index)
      : [],
  );

  const raw: Segment[] = [];
  let cursor = 0;
  units.forEach((unit, i) => {
    if (unit.start > cursor) raw.push({ text: passage.slice(cursor, unit.start), kind: "prose", marked: false });
    raw.push({ text: passage.slice(unit.start, unit.end), kind: unit.kind, marked: marked.has(i) });
    cursor = unit.end;
  });
  if (cursor < passage.length) raw.push({ text: passage.slice(cursor), kind: "prose", marked: false });

  // Merge neighbours that look the same, so the page gets a few runs instead of one node per sentence.
  const segments: Segment[] = [];
  for (const seg of raw) {
    const last = segments.at(-1);
    if (last && last.kind === seg.kind && last.marked === seg.marked && seg.kind === "prose") last.text += seg.text;
    else segments.push({ ...seg });
  }
  return { segments, matched };
}
