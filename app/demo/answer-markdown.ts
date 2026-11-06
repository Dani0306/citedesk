// A small Markdown subset for cited answers: paragraphs, headings, lists, fenced code, inline code,
// bold, and [n] / [1, 3] citation markers. It returns plain data the React side turns into
// elements, so model text never becomes HTML. Links keep their text only: the model is told not
// to write URLs, and the only links on the page are the ones code built from retrieval. A fence
// still open mid-stream is shown as code until it closes.

export type Inline = { type: "text"; text: string } | { type: "code"; text: string } | { type: "strong"; text: string } | { type: "cite"; n: number };

export type Block =
  | { type: "p"; inlines: Inline[] }
  | { type: "heading"; inlines: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "code"; lang: string; text: string };

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w-]*)\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

function plain(text: string, out: Inline[]) {
  // Markdown links keep their label; everything else stays text, split around markers.
  const unlinked = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  let last = 0;
  for (const m of unlinked.matchAll(MARKER)) {
    if (m.index > last) out.push({ type: "text", text: unlinked.slice(last, m.index) });
    for (const part of m[1].split(",")) out.push({ type: "cite", n: Number(part.trim()) });
    last = m.index + m[0].length;
  }
  if (last < unlinked.length) out.push({ type: "text", text: unlinked.slice(last) });
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  // Inline code first, so brackets and asterisks inside it are never read.
  const parts = text.split(/(`[^`]*`)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.length >= 2 && part.startsWith("`") && part.endsWith("`")) {
      out.push({ type: "code", text: part.slice(1, -1) });
      continue;
    }
    const pieces = part.split(/(\*\*[^*]+\*\*)/g);
    for (const piece of pieces) {
      if (!piece) continue;
      if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) out.push({ type: "strong", text: piece.slice(2, -2) });
      else plain(piece, out);
    }
  }
  return out;
}

export function parseAnswer(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (para.length) blocks.push({ type: "p", inlines: parseInline(para.join(" ")) });
    if (list) blocks.push({ type: "list", ordered: list.ordered, items: list.items.map(parseInline) });
    para = [];
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(FENCE);
    if (fence) {
      flush();
      const code: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const close = lines[j].match(FENCE);
        if (close && close[1][0] === fence[1][0] && close[1].length >= fence[1].length && !close[2]) break;
        code.push(lines[j]);
      }
      blocks.push({ type: "code", lang: fence[2], text: code.join("\n") });
      i = j;
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      flush();
      blocks.push({ type: "heading", inlines: parseInline(heading[1]) });
      continue;
    }
    const bullet = line.match(BULLET);
    const numbered = bullet ? null : line.match(NUMBERED);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (para.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    if (list && /^\s+\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (list) flush();
    para.push(line.trim());
  }
  flush();
  return blocks;
}
