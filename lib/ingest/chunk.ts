import { createHash } from "node:crypto";
import { countTokens as cl100k } from "gpt-tokenizer/encoding/cl100k_base";
import { chunkKey, sectionUrl } from "./corpus";
import type { ParsedPage, Section } from "./mdx";

// Chunks follow the heading structure: a heading is the author's own topic boundary, and the
// citation anchor belongs to the section. A section absorbs its own sub-sections while the total
// stays within maxTokens (owner decision, 5 Nov: the guides are mostly short sections, so strict
// one-section chunks gave 1,161 chunks with a median of 112 tokens). A chunk never reaches a
// sibling or the next section, so its anchor still points at a heading that contains all of it.
// A section too long on its own is split at block boundaries, each chunk starting with the tail
// of the previous one (~15% overlap). Token counts use cl100k_base, text-embedding-3-small's encoding.

export const CHUNKING = { minTokens: 500, maxTokens: 800, overlapRatio: 0.15, mergeSubsections: true, version: 1 } as const;
export type ChunkSettings = {
  minTokens: number;
  maxTokens: number;
  overlapRatio: number;
  mergeSubsections: boolean;
  version: number;
};
export type CountTokens = (text: string) => number;

export const countTokens: CountTokens = (text) => cl100k(text);

export type Chunk = {
  ordinal: number;
  chunkKey: string;
  headingPath: string[];
  anchor: string;
  sourceUrl: string;
  content: string;
  tokenCount: number;
  /** What gets embedded: the heading path, a blank line, then the content. */
  embedText: string;
};

/** Changes whenever the settings or the chunker's behaviour (version) change. */
export function chunkingHash(settings: ChunkSettings = CHUNKING): string {
  const { minTokens, maxTokens, overlapRatio, mergeSubsections, version } = settings;
  return createHash("sha256").update(JSON.stringify({ minTokens, maxTokens, overlapRatio, mergeSubsections, version })).digest("hex");
}

/**
 * Groups each section with the sub-sections that directly follow it (deeper headings, before the
 * next heading at its own depth or above) while the total fits in maxTokens. The text before the
 * first heading absorbs nothing. A sub-section that doesn't fit starts its own group.
 */
export function groupSections(
  sections: Section[],
  settings: ChunkSettings = CHUNKING,
  count: CountTokens = countTokens,
): { head: Section; body: string }[] {
  const groups: { head: Section; body: string }[] = [];
  let i = 0;
  while (i < sections.length) {
    const head = sections[i];
    let body = head.body;
    let j = i + 1;
    if (settings.mergeSubsections && head.depth > 0) {
      while (j < sections.length && sections[j].depth > head.depth) {
        const child = sections[j];
        const candidate = `${body}\n\n${"#".repeat(child.depth)} ${child.headingPath.at(-1)}\n\n${child.body}`;
        if (count(candidate) > settings.maxTokens) break;
        body = candidate;
        j++;
      }
    }
    groups.push({ head, body });
    i = j;
  }
  return groups;
}

/** Blank-line separated blocks; a fenced code block (with its blank lines) is one block. */
export function splitBlocks(body: string): string[] {
  const blocks: string[] = [];
  let buf: string[] = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^(`{3,}|~{3,})/.test(line.trimStart())) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      if (buf.length) blocks.push(buf.join("\n"));
      buf = [];
      continue;
    }
    buf.push(line);
  }
  if (buf.length) blocks.push(buf.join("\n"));
  return blocks;
}

/** Splits one oversized block into pieces of at most max tokens: by lines, then by words. */
function splitOversized(block: string, max: number, count: CountTokens): string[] {
  const pieces: string[] = [];
  let cur: string[] = [];
  const pushWords = (line: string) => {
    let words: string[] = [];
    for (const w of line.split(/(\s+)/)) {
      if (words.length && count([...words, w].join("")) > max) {
        pieces.push(words.join("").trim());
        words = [];
      }
      words.push(w);
    }
    if (words.length) cur = [words.join("")];
  };
  for (const line of block.split("\n")) {
    if (count(line) > max) {
      if (cur.length) pieces.push(cur.join("\n"));
      cur = [];
      pushWords(line);
      continue;
    }
    if (cur.length && count([...cur, line].join("\n")) > max) {
      pieces.push(cur.join("\n"));
      cur = [];
    }
    cur.push(line);
  }
  if (cur.length) pieces.push(cur.join("\n"));
  return pieces.filter((p) => p.trim());
}

export function chunkSection(body: string, settings: ChunkSettings = CHUNKING, count: CountTokens = countTokens): string[] {
  const { maxTokens: max } = settings;
  if (count(body) <= max) return [body];

  const blocks = splitBlocks(body).flatMap((b) => (count(b) > max ? splitOversized(b, max, count) : [b]));
  const overlapTarget = Math.round(max * settings.overlapRatio);
  const chunks: string[] = [];
  let cur: string[] = [];

  for (const block of blocks) {
    if (cur.length && count([...cur, block].join("\n\n")) > max) {
      chunks.push(cur.join("\n\n"));
      // Carry the tail of the finished chunk forward, as long as it leaves room for the new block.
      const tail: string[] = [];
      for (let i = cur.length - 1; i >= 0; i--) {
        if (count([cur[i], ...tail].join("\n\n")) > overlapTarget) break;
        tail.unshift(cur[i]);
      }
      cur = count([...tail, block].join("\n\n")) <= max ? tail : [];
    }
    cur.push(block);
  }
  if (cur.length) chunks.push(cur.join("\n\n"));
  return chunks;
}

export function chunkPage(rel: string, page: ParsedPage, settings: ChunkSettings = CHUNKING, count: CountTokens = countTokens): Chunk[] {
  const out: Chunk[] = [];
  for (const { head: section, body } of groupSections(page.sections, settings, count)) {
    for (const content of chunkSection(body, settings, count)) {
      out.push({
        ordinal: out.length,
        chunkKey: chunkKey(rel, section.anchor),
        headingPath: section.headingPath,
        anchor: section.anchor,
        sourceUrl: sectionUrl(rel, section.anchor),
        content,
        tokenCount: count(content),
        embedText: `${section.headingPath.join(" › ")}\n\n${content}`,
      });
    }
  }
  return out;
}
