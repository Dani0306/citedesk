import { describe, expect, it } from "vitest";
import { closestSection, gate, isModelRefusal, PROVISIONAL_REFUSAL_THRESHOLD, refusalThreshold } from "@/lib/answer/refusal";
import type { RetrievedChunk } from "@/lib/retrieve/vector";

const chunk = (similarity: number, content = "Body"): RetrievedChunk => ({
  id: 1,
  chunkKey: "database/postgres/indexes#partial-indexes",
  headingPath: ["Managing Indexes in Postgres", "Partial indexes"],
  anchor: "partial-indexes",
  sourceUrl: "https://supabase.com/docs/guides/database/postgres/indexes#partial-indexes",
  content,
  similarity,
  rank: 1,
});

describe("refusalThreshold", () => {
  it("uses the provisional value when the env var is empty or unset", () => {
    expect(refusalThreshold({})).toEqual({ value: PROVISIONAL_REFUSAL_THRESHOLD, source: "provisional" });
    expect(refusalThreshold({ CITEDESK_REFUSAL_THRESHOLD: " " }).source).toBe("provisional");
  });

  it("lets the env var win, and rejects nonsense loudly", () => {
    expect(refusalThreshold({ CITEDESK_REFUSAL_THRESHOLD: "0.55" })).toEqual({ value: 0.55, source: "env" });
    expect(() => refusalThreshold({ CITEDESK_REFUSAL_THRESHOLD: "high" })).toThrow(/between 0 and 1/);
    expect(() => refusalThreshold({ CITEDESK_REFUSAL_THRESHOLD: "78" })).toThrow(/between 0 and 1/);
  });
});

describe("gate", () => {
  it("refuses below the threshold and answers at or above it", () => {
    expect(gate(0.59, 0.6)).toBe("low_score");
    expect(gate(0.6, 0.6)).toBeNull();
    expect(gate(0.684, 0.6)).toBeNull();
  });

  it("refuses with no_matches when retrieval returned nothing", () => {
    expect(gate(null, 0.6)).toBe("no_matches");
  });
});

describe("isModelRefusal", () => {
  it("accepts the exact reply, with a curly apostrophe or no full stop", () => {
    expect(isModelRefusal("I don't know.")).toBe(true);
    expect(isModelRefusal("  I don’t know  ")).toBe(true);
  });

  it("treats anything longer as an answer", () => {
    expect(isModelRefusal("I don't know the exact limit, but the sources say [1].")).toBe(false);
  });
});

describe("closestSection", () => {
  it("gives the title, the anchored URL and a word-boundary snippet without fence lines", () => {
    const content = "```sql\ncreate index on t (a) where b;\n```\n\n" + "word ".repeat(100);
    const s = closestSection(chunk(0.48, content), 40);
    expect(s.title).toBe("Managing Indexes in Postgres › Partial indexes");
    expect(s.url).toMatch(/#partial-indexes$/);
    expect(s.snippet.startsWith("create index on t (a) where b;")).toBe(true);
    expect(s.snippet.endsWith("…")).toBe(true);
    expect(s.snippet.length).toBeLessThanOrEqual(41);
  });
});
