import GithubSlugger from "github-slugger";

// A line-based reader for Supabase's guide MDX. It keeps what a reader sees on the page and the
// heading structure, and drops what they don't (frontmatter, ESM, comments, component tags).
// Heading anchors follow what supabase.com actually renders (checked against the live pages with
// `npm run corpus:check-anchors`): an explicit `[#id]` wins; otherwise github-slugger over the
// heading text, one slugger per page so repeats get -1, -2, then underscores dropped. Inline code
// touching punctuation is space-padded first, which is how `(\`vector_l2_ops\`)` becomes
// `--vectorl2ops-`. Headings inside container components (tabs, accordions, admonitions) get no
// id on the site, so they stay text here instead of starting a section.

export type Section = {
  /** Page title first, then each ancestor heading, then this heading. */
  headingPath: string[];
  /** "" for the text before the first heading. */
  anchor: string;
  depth: number;
  body: string;
};

export type ParsedPage = { title: string; sections: Section[] };

/** Returns a partial's raw MDX, or null if it doesn't exist. */
export type PartialReader = (path: string) => string | null;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const PARTIAL = /<\$Partial\s+path="([^"]+)"[^>]*?\/>/g;
const EXPLICIT_ID = /\s*\[#([^\]]+?)\]\s*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^(\s*)(`{3,}|~{3,})/;
const ESM = /^(import\s.+\sfrom\s|import\s+['"]|export\s+(const|let|default|function)\b)/;
// Components whose content is decoration, not text: drop the tag and everything inside it.
const DECORATIVE = new Set(["Image", "YouTube", "ContentListings", "GlassPanel", "Link", "NavData"]);
// Components whose headings the site renders without an id.
const CONTAINER = /^(Tabs|TabPanel|Accordion|AccordionItem|Admonition|StepHikeCompact(\.\w+)?)$/;

export function parseFrontmatter(src: string): { data: Record<string, string>; body: string } {
  const m = src.match(FRONTMATTER);
  if (!m) return { data: {}, body: src };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return { data, body: src.slice(m[0].length) };
}

/** Replaces `<$Partial path="…" />` with the partial's content, as the site renders it. */
export function inlinePartials(src: string, read: PartialReader, depth = 0): string {
  if (depth > 3) throw new Error("Partials nested more than 3 deep");
  return src.replace(PARTIAL, (_, path: string) => {
    const content = read(path);
    if (content === null) throw new Error(`Partial not found: ${path}`);
    return inlinePartials(parseFrontmatter(content).body, read, depth + 1);
  });
}

/**
 * Heading text the way mdast flattens it: inline code keeps its text verbatim, links keep their
 * label, emphasis markers drop. Code is set aside first so `vector_l2_ops` is never read as italics.
 */
export function flattenHeading(text: string, { padCode = false } = {}): string {
  const codes: string[] = [];
  const held = text.replace(/(\S?)`([^`]*)`(\S?)/g, (_, before: string, code: string, after: string) => {
    codes.push(code);
    const pad = (c: string) => (padCode && c ? " " : "");
    return `${before}${pad(before)}\u0000${codes.length - 1}\u0000${pad(after)}${after}`;
  });
  return held
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\/?[A-Za-z$][^>]*>/g, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/(^|[^\w])_(.+?)_(?=[^\w]|$)/g, "$1$2")
    .replace(/\\(.)/g, "$1")
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)])
    .trim();
}

/** The anchor supabase.com gives a heading without an explicit [#id]. */
export function siteSlug(slugger: GithubSlugger, headingText: string): string {
  return slugger.slug(flattenHeading(headingText, { padCode: true })).replace(/_/g, "");
}

/** Removes component tags from a prose line, keeping the text between them. */
function stripTags(line: string): string {
  return line.replace(/<\/?[A-Z$][\w$.]*(\s[^<>]*?)?\/?>/g, "");
}

function componentName(line: string): string | null {
  const m = line.trim().match(/^<\/?([A-Z$][\w$.]*)/);
  return m ? m[1] : null;
}

export function parseMdx(src: string, read: PartialReader = () => null): ParsedPage {
  const { data, body } = parseFrontmatter(src);
  const title = data.title ?? "";
  const lines = inlinePartials(body, read).split(/\r?\n/);

  const slugger = new GithubSlugger();
  const sections: Section[] = [];
  const stack: { depth: number; text: string }[] = [];
  let current: { headingPath: string[]; anchor: string; depth: number; lines: string[] } = {
    headingPath: title ? [title] : [],
    anchor: "",
    depth: 0,
    lines: [],
  };

  let fence: { marker: string; indent: number } | null = null;
  let inComment = false;
  let openTag: string | null = null; // multi-line opening tag still being read
  let skipDepth = 0; // inside a decorative component
  let skipName = "";
  let containerDepth = 0; // inside tabs, accordions or admonitions

  const flush = () => {
    const text = current.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text) sections.push({ headingPath: current.headingPath, anchor: current.anchor, depth: current.depth, body: text });
  };

  for (const raw of lines) {
    // Code fences: everything inside is content, verbatim (dedented by the fence's indent).
    const fm = raw.match(FENCE);
    if (fence) {
      if (fm && fm[2][0] === fence.marker[0] && fm[2].length >= fence.marker.length && raw.trim() === fm[2]) {
        current.lines.push(fm[2]);
        fence = null;
      } else {
        current.lines.push(raw.slice(Math.min(fence.indent, raw.length - raw.trimStart().length)));
      }
      continue;
    }
    if (fm && skipDepth === 0) {
      fence = { marker: fm[2], indent: fm[1].length };
      current.lines.push(raw.trimStart());
      continue;
    }

    let line = raw;

    // MDX comments, possibly spanning lines.
    if (inComment) {
      const end = line.indexOf("*/}");
      if (end === -1) continue;
      line = line.slice(end + 3);
      inComment = false;
    }
    line = line.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    const open = line.indexOf("{/*");
    if (open !== -1) {
      line = line.slice(0, open);
      inComment = true;
    }

    // The rest of a multi-line opening tag.
    if (openTag) {
      const done = /\/?>\s*$/.test(line.trim()) || line.includes(">");
      if (done) {
        const selfClosing = /\/>\s*$/.test(line.trim());
        if (DECORATIVE.has(openTag) && !selfClosing) {
          skipDepth = 1;
          skipName = openTag;
        } else if (CONTAINER.test(openTag) && !selfClosing) {
          containerDepth++;
        }
        openTag = null;
      }
      continue;
    }

    // Inside a decorative component: drop everything until it closes.
    if (skipDepth > 0) {
      const name = componentName(line);
      if (name === skipName && line.trim().startsWith("</")) skipDepth--;
      else if (name === skipName && !/\/>\s*$/.test(line.trim())) skipDepth++;
      continue;
    }

    if (ESM.test(line)) continue;

    const name = componentName(line);
    if (name) {
      const trimmed = line.trim();
      const tagEnds = /^<[^<]*>/.test(trimmed);
      if (!tagEnds) {
        openTag = name; // props continue on the next lines
        continue;
      }
      if (DECORATIVE.has(name)) {
        const selfClosing = /^<[^<]*\/>/.test(trimmed);
        const closesOnLine = trimmed.includes(`</${name}>`);
        if (!selfClosing && !closesOnLine && !trimmed.startsWith("</")) {
          skipDepth = 1;
          skipName = name;
        }
        continue;
      }
      if (CONTAINER.test(name)) {
        if (trimmed.startsWith("</")) containerDepth = Math.max(0, containerDepth - 1);
        else if (!/^<[^<]*\/>/.test(trimmed) && !trimmed.includes(`</${name}>`)) containerDepth++;
      }
    }

    const h = line.match(HEADING);
    if (h && containerDepth > 0) {
      // The site gives these no id: keep the heading as a line of text in the current section.
      current.lines.push(flattenHeading(h[2].replace(EXPLICIT_ID, "")));
      continue;
    }
    if (h) {
      flush();
      const depth = h[1].length;
      let text = h[2];
      const explicit = text.match(EXPLICIT_ID);
      if (explicit) text = text.slice(0, explicit.index);
      const flat = flattenHeading(text);
      const anchor = explicit ? explicit[1] : siteSlug(slugger, text);
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      stack.push({ depth, text: flat });
      current = { headingPath: [...(title ? [title] : []), ...stack.map((s) => s.text)], anchor, depth, lines: [] };
      continue;
    }

    current.lines.push(stripTags(line).replace(/\s+$/, ""));
  }
  flush();
  return { title, sections };
}
