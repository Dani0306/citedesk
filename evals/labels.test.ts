import { describe, expect, it } from "vitest";
import { checkLabels, mergedInto, normaliseLabel } from "@/evals/labels";
import { QuestionSet, questionsHash } from "@/evals/schema";
import { parseMdx } from "@/lib/ingest/mdx";

const set = (questions: unknown[]) => QuestionSet.parse({ version: 1, questions });
const q = (id: string, question: string, expected: string[]) => ({ id, question, answerable: expected.length > 0, expected });

describe("normaliseLabel", () => {
  it("turns a live URL and a key into the same key", () => {
    const key = "database/postgres/indexes#partial-indexes";
    expect(normaliseLabel(key)).toBe(key);
    expect(normaliseLabel(" https://supabase.com/docs/guides/database/postgres/indexes#partial-indexes ")).toBe(key);
    expect(normaliseLabel("/database/postgres/indexes/#partial-indexes")).toBe(key);
  });

  it("reads a bare page as its preamble chunk", () => {
    expect(normaliseLabel("https://supabase.com/docs/guides/ai/going-to-prod")).toBe("ai/going-to-prod");
  });

  it("rejects a URL outside the corpus", () => {
    expect(() => normaliseLabel("https://example.com/docs/guides/x#y")).toThrow(/Not a page of the corpus/);
  });
});

describe("question schema", () => {
  it("requires labels exactly when the question is answerable", () => {
    expect(() => set([{ id: "a", question: "q", answerable: true, expected: [] }])).toThrow(/at least one expected key/);
    expect(() => set([{ id: "a", question: "q", answerable: false, expected: ["x"] }])).toThrow();
  });

  it("hashes only what affects scoring", () => {
    const a = set([{ ...q("a", "q", ["k"]), tags: ["x"] }]);
    const b = set([{ ...q("a", "q", ["k"]), tags: ["y"], note: "n" }]);
    expect(questionsHash(a)).toBe(questionsHash(b));
    expect(questionsHash(a)).not.toBe(questionsHash(set([q("a", "q2", ["k"])])));
  });
});

describe("checkLabels", () => {
  const known = new Set(["database/postgres/indexes#partial-indexes", "ai/going-to-prod#a"]);

  it("passes a clean set", () => {
    expect(checkLabels(set([q("r01", "Skip deleted rows in an index?", ["database/postgres/indexes#partial-indexes"])]), known)).toEqual([]);
  });

  it("reports every problem at once", () => {
    const problems = checkLabels(
      set([
        q("r01", "Same?", ["ai/going-to-prod#a", "https://supabase.com/docs/guides/ai/going-to-prod#a"]),
        q("r01", "same? ", ["database/nope#x"]),
        q("r03", "Merged child", ["ai/going-to-prod#a-child"]),
      ]),
      known,
      new Map([["ai/going-to-prod#a-child", "ai/going-to-prod#a"]]),
    );
    expect(problems).toEqual([
      { id: "r01", message: "ai/going-to-prod#a is listed twice" },
      { id: "r01", message: "duplicate id" },
      { id: "r01", message: "same question as r01" },
      { id: "r01", message: "database/nope#x is not a chunk_key; run npm run eval:keys database/nope to see the page's keys" },
      { id: "r03", message: "ai/going-to-prod#a-child is merged into its parent's chunk; label ai/going-to-prod#a instead" },
    ]);
  });
});

describe("mergedInto", () => {
  it("maps each absorbed sub-section to the key of the chunk it lives in", () => {
    const page = parseMdx("---\ntitle: 'P'\n---\n\n## Parent\n\nText.\n\n### Child\n\nMore.\n\n## Sibling\n\nOther.");
    expect([...mergedInto([{ rel: "ai/p", page }])]).toEqual([["ai/p#child", "ai/p#parent"]]);
  });
});
