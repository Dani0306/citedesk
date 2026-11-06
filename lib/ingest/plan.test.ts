import { describe, expect, it } from "vitest";
import type { Chunk } from "@/lib/ingest/chunk";
import { contentHash, makePlan, type CorpusFile } from "@/lib/ingest/plan";

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const chunk = (text: string): Chunk => ({
  ordinal: 0,
  chunkKey: "k",
  headingPath: [],
  anchor: "",
  sourceUrl: "https://x",
  content: text,
  tokenCount: words(text),
  embedText: text,
});
const file = (rel: string, body: string, n = 1): CorpusFile => ({
  rel,
  sourceUrl: `https://supabase.com/docs/guides/${rel}`,
  contentHash: contentHash(body),
  chunks: Array.from({ length: n }, () => chunk("one two three four")),
});

describe("makePlan", () => {
  const a = file("database/a", "A body", 2);
  const b = file("database/b", "B body");

  it("redoes everything on the first run and prices it", () => {
    const plan = makePlan([a, b], [], "h1", words);
    expect(plan.redo.map((f) => f.rel)).toEqual(["database/a", "database/b"]);
    expect(plan.chunkCount).toBe(3);
    expect(plan.embedTokens).toBe(12);
    expect(plan.estimatedUsd).toBe(0.00000024);
  });

  it("skips files whose content and chunking are unchanged, so a re-run costs nothing", () => {
    const stored = [
      { id: 1, path: "database/a", content_hash: a.contentHash, chunking_hash: "h1" },
      { id: 2, path: "database/b", content_hash: b.contentHash, chunking_hash: "h1" },
    ];
    const plan = makePlan([a, b], stored, "h1", words);
    expect(plan.redo).toHaveLength(0);
    expect(plan.estimatedUsd).toBe(0);
  });

  it("redoes a file when its content or the chunking settings change", () => {
    const stored = [
      { id: 1, path: "database/a", content_hash: "old", chunking_hash: "h1" },
      { id: 2, path: "database/b", content_hash: b.contentHash, chunking_hash: "h0" },
    ];
    expect(makePlan([a, b], stored, "h1", words).redo.map((f) => f.rel)).toEqual(["database/a", "database/b"]);
  });

  it("treats a half-finished file (empty hash) as changed", () => {
    const stored = [{ id: 1, path: "database/a", content_hash: "", chunking_hash: "" }];
    expect(makePlan([a], stored, "h1", words).redo).toHaveLength(1);
  });

  it("removes stored files that left the corpus", () => {
    const stored = [{ id: 9, path: "database/gone", content_hash: "x", chunking_hash: "h1" }];
    expect(makePlan([a], stored, "h1", words).remove.map((s) => s.path)).toEqual(["database/gone"]);
  });
});
