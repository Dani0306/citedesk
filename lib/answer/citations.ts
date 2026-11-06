import type { RetrievedChunk } from "../retrieve/vector";

// Citation markers, validated in code (T15). The model cites [n] against the numbered sources we
// sent; this checks every marker against what retrieval returned for that query. A marker outside
// 1..k is a hallucinated citation: it is counted, and the target is zero. Code, inline code and
// markdown links are not prose, so brackets inside them are never markers.

export type CitationCheck = {
  /** Valid source numbers in first-use order, each with its chunk id. */
  cited: { n: number; chunkId: number }[];
  /** Every marker occurrence that points at no source sent for this query. */
  invalid: number[];
  /** Prose sentences with no marker. A rough signal for the groundedness evals, not a verdict. */
  uncitedSentences: number;
};

// An unclosed fence runs to the end of the answer ((?![\s\S]), since $ means end of line under m).
const FENCED = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\1[^\n]*|(?![\s\S]))/gm;
const INLINE_CODE = /`[^`\n]*`/g;
const LINK = /!?\[([^\]]*)\]\([^)]*\)/g;
const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
// A sentence ends at . ! or ? plus any markers after it, followed by a capital or a list/line start.
const SENTENCE_END = /(?<=[.!?](?:\s*\[\d+(?:\s*,\s*\d+)*\])*)\s+(?=[A-Z])/;

/** The answer with code and links reduced to plain words, keeping line breaks. */
export function proseOf(answer: string): string {
  return answer.replace(FENCED, "\n").replace(INLINE_CODE, "code").replace(LINK, "$1");
}

export type Sentence = {
  /** 0-based position among the answer's prose sentences. */
  index: number;
  /** The sentence as written, markers and inline code included. */
  text: string;
  /** Every marker number in the sentence, in order (valid or not). */
  markers: number[];
};

const wordsIn = (text: string) => text.replace(MARKER, "").trim().split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;

/**
 * The answer's prose sentences: the unit of groundedness for the uncited count, the human labels
 * and the judge alike, so all three split the same way. Code blocks are dropped; inline code is kept
 * verbatim but never split inside; headings, table rows and fragments under three words are skipped.
 */
export function splitSentences(answer: string): Sentence[] {
  const codes: string[] = [];
  const held = answer.replace(FENCED, "\n").replace(INLINE_CODE, (code) => `\u0000${codes.push(code) - 1}\u0000`);
  const restore = (text: string) => text.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)]);
  const out: Sentence[] = [];
  for (const rawLine of held.split("\n")) {
    const line = rawLine.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim();
    if (!line || line.startsWith("#") || line.startsWith("|")) continue;
    for (const part of line.split(SENTENCE_END)) {
      const plain = part.replace(LINK, "$1");
      if (wordsIn(plain.replace(/\u0000\d+\u0000/g, "code")) < 3) continue;
      const markers = [...plain.matchAll(MARKER)].flatMap((m) => m[1].split(",").map((n) => Number(n.trim())));
      out.push({ index: out.length, text: restore(part.trim()), markers });
    }
  }
  return out;
}

export function checkCitations(answer: string, chunks: Pick<RetrievedChunk, "id">[]): CitationCheck {
  const prose = proseOf(answer);
  const cited: CitationCheck["cited"] = [];
  const invalid: number[] = [];
  for (const m of prose.matchAll(MARKER)) {
    for (const part of m[1].split(",")) {
      const n = Number(part.trim());
      if (n >= 1 && n <= chunks.length) {
        if (!cited.some((c) => c.n === n)) cited.push({ n, chunkId: chunks[n - 1].id });
      } else {
        invalid.push(n);
      }
    }
  }
  return { cited, invalid, uncitedSentences: splitSentences(answer).filter((x) => x.markers.length === 0).length };
}
