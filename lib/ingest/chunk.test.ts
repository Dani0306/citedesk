import { describe, expect, it } from "vitest";
import { CHUNKING, chunkingHash, chunkPage, chunkSection, countTokens, groupSections, splitBlocks } from "@/lib/ingest/chunk";
import { parseMdx } from "@/lib/ingest/mdx";

// A word-count tokenizer keeps the size maths readable in tests.
const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const small = { minTokens: 5, maxTokens: 20, overlapRatio: 0.15, mergeSubsections: true, version: 1 };
const para = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(" ");

describe("splitBlocks", () => {
  it("keeps a fenced code block with blank lines as one block", () => {
    const body = "Intro.\n\n```sql\nselect 1;\n\nselect 2;\n```\n\nOutro.";
    expect(splitBlocks(body)).toEqual(["Intro.", "```sql\nselect 1;\n\nselect 2;\n```", "Outro."]);
  });
});

describe("chunkSection", () => {
  it("keeps a section within the limit as one chunk, even below the minimum", () => {
    expect(chunkSection("Short section.", small, words)).toEqual(["Short section."]);
  });

  it("splits a long section with no chunk above the limit and an overlap between chunks", () => {
    const body = [para(8, "a"), para(8, "b"), para(8, "c"), para(8, "d")].join("\n\n");
    const chunks = chunkSection(body, { ...small, overlapRatio: 0.5 }, words);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(words(c)).toBeLessThanOrEqual(20);
    // Each later chunk starts with the last block of the one before it.
    for (let i = 1; i < chunks.length; i++) {
      const prevLast = chunks[i - 1].split("\n\n").at(-1)!;
      expect(chunks[i].startsWith(prevLast)).toBe(true);
    }
  });

  it("splits a single oversized block by lines, then words", () => {
    const body = para(50, "w");
    const chunks = chunkSection(body, small, words);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) expect(words(c)).toBeLessThanOrEqual(20);
    expect(chunks.join(" ").split(/\s+/)).toHaveLength(50);
  });
});

describe("groupSections", () => {
  const sec = (depth: number, path: string[], body: string) => ({ depth, headingPath: ["T", ...path], anchor: path.join("-"), body });

  it("absorbs a section's own sub-sections while they fit", () => {
    const groups = groupSections([sec(2, ["A"], "a a"), sec(3, ["A", "B"], "b b"), sec(4, ["A", "B", "C"], "c c")], small, words);
    expect(groups).toHaveLength(1);
    expect(groups[0].head.anchor).toBe("A");
    expect(groups[0].body).toBe("a a\n\n### B\n\nb b\n\n#### C\n\nc c");
  });

  it("never absorbs a sibling or the next higher section", () => {
    const groups = groupSections([sec(3, ["A", "B"], "b"), sec(3, ["A", "C"], "c"), sec(2, ["D"], "d")], small, words);
    expect(groups.map((g) => g.head.anchor)).toEqual(["A-B", "A-C", "D"]);
  });

  it("stops at the token limit, and the rest start their own groups", () => {
    const groups = groupSections([sec(2, ["A"], para(12, "a")), sec(3, ["A", "B"], para(12, "b")), sec(3, ["A", "C"], "c")], small, words);
    expect(groups.map((g) => g.head.anchor)).toEqual(["A", "A-B", "A-C"]);
  });

  it("keeps the preamble on its own", () => {
    const groups = groupSections([sec(0, [], "intro"), sec(2, ["A"], "a")], small, words);
    expect(groups).toHaveLength(2);
  });

  it("does nothing when merging is turned off", () => {
    const groups = groupSections([sec(2, ["A"], "a"), sec(3, ["A", "B"], "b")], { ...small, mergeSubsections: false }, words);
    expect(groups).toHaveLength(2);
  });
});

describe("chunkPage", () => {
  const md = "---\ntitle: 'Indexes'\n---\n\nIntro.\n\n## Create an index\n\nUse create index.\n\n## Partial indexes\n\nUse a where clause.";

  it("never spans two headings and labels each chunk with its section", () => {
    const chunks = chunkPage("database/postgres/indexes", parseMdx(md));
    expect(chunks.map((c) => c.chunkKey)).toEqual([
      "database/postgres/indexes",
      "database/postgres/indexes#create-an-index",
      "database/postgres/indexes#partial-indexes",
    ]);
    expect(chunks[1]).toMatchObject({
      ordinal: 1,
      anchor: "create-an-index",
      sourceUrl: "https://supabase.com/docs/guides/database/postgres/indexes#create-an-index",
      headingPath: ["Indexes", "Create an index"],
      content: "Use create index.",
    });
  });

  it("embeds the heading path with the content but stores the content alone", () => {
    const [, c] = chunkPage("database/postgres/indexes", parseMdx(md));
    expect(c.embedText).toBe("Indexes › Create an index\n\nUse create index.");
    expect(c.tokenCount).toBe(countTokens("Use create index."));
  });
});

describe("chunkingHash", () => {
  it("is stable for the same settings and changes with any of them", () => {
    expect(chunkingHash()).toBe(chunkingHash({ ...CHUNKING }));
    expect(chunkingHash({ ...CHUNKING, maxTokens: 900 })).not.toBe(chunkingHash());
    expect(chunkingHash({ ...CHUNKING, version: 2 })).not.toBe(chunkingHash());
    expect(chunkingHash({ ...CHUNKING, mergeSubsections: false })).not.toBe(chunkingHash());
  });
});

describe("countTokens", () => {
  it("counts cl100k_base tokens", () => {
    expect(countTokens("hello world")).toBe(2);
  });
});
