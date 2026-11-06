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

const FENCED = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\1[^\n]*|$)/gm;
const INLINE_CODE = /`[^`\n]*`/g;
const LINK = /!?\[([^\]]*)\]\([^)]*\)/g;
const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
// A sentence ends at . ! or ? plus any markers after it, followed by a capital or a list/line start.
const SENTENCE_END = /(?<=[.!?](?:\s*\[\d+(?:\s*,\s*\d+)*\])*)\s+(?=[A-Z])/;

/** The answer with code and links reduced to plain words, keeping line breaks. */
export function proseOf(answer: string): string {
  return answer.replace(FENCED, "\n").replace(INLINE_CODE, "code").replace(LINK, "$1");
}

function countUncited(prose: string): number {
  let uncited = 0;
  for (const rawLine of prose.split("\n")) {
    const line = rawLine.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim();
    if (!line || line.startsWith("#") || line.startsWith("|")) continue;
    for (const sentence of line.split(SENTENCE_END)) {
      if (sentence.replace(MARKER, "").trim().split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length < 3) continue;
      if (!new RegExp(MARKER.source).test(sentence)) uncited++;
    }
  }
  return uncited;
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
  return { cited, invalid, uncitedSentences: countUncited(prose) };
}
