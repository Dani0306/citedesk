import { describe, expect, it } from "vitest";
import { codeBody, highlightPassage, splitUnits, words } from "@/lib/answer/highlight";

// Real passages from the ingested Supabase docs (Apache-2.0), as they are stored in citedesk.chunks.
const PARTIAL =
  "If you are frequently querying a subset of rows then it may be more efficient to build a partial index. In our example, perhaps we only want to match on `age` where `deceased is false`. We could build a partial index:\n\n```sql\ncreate index idx_living_persons_age on persons (age)\nwhere deceased is false;\n```";

const HNSW =
  "HNSW should be your default choice when creating a vector index. Add the index when you don't need 100% accuracy and are willing to trade a small amount of accuracy for a lot of throughput.\n\nUnlike [IVFFlat indexes](/docs/guides/ai/vector-indexes/ivf-indexes), you are safe to build an HNSW index immediately after the table is created. HNSW indexes are based on graphs which inherently are not affected by the same limitations as IVFFlat. As new data is added to the table, the index will be filled automatically and the index structure will remain optimal.";

const RLS =
  "1. Enable row level security on the table:\n\n```sql\nalter table movies enable row level security;\n```\n\n2. Add a policy that describes who can read the table. Until one exists, Data API requests return no rows. The table's owner and roles with `BYPASSRLS` aren't subject to policies, which is why the same query still returns rows in the SQL editor:\n\n```sql\ncreate policy \"Anyone can read movies\"\non movies for select\nto anon, authenticated\nusing ( true );\n```";

const markedText = (passage: string, claim: string) =>
  highlightPassage(passage, claim)
    .segments.filter((s) => s.marked)
    .map((s) => s.text);

describe("highlightPassage", () => {
  it("marks the sentence that carries the claim's wording", () => {
    const claim = "Use HNSW as the default when approximate results are acceptable and you're willing to trade a small amount of accuracy for higher throughput.";
    expect(markedText(HNSW, claim)).toEqual(["Add the index when you don't need 100% accuracy and are willing to trade a small amount of accuracy for a lot of throughput."]);
  });

  it("marks a precise sentence in the middle of a list item", () => {
    const claim = "Until a policy exists, Data API requests return no rows.";
    expect(markedText(RLS, claim)).toEqual(["Until one exists, Data API requests return no rows."]);
  });

  it("can mark a code block together with the sentence that introduces it, and keeps the block whole", () => {
    const h = highlightPassage(PARTIAL, "Use a `WHERE` clause to limit the index to the rows you query.");
    expect(h.matched).toBe(true);
    const code = h.segments.find((s) => s.kind === "code");
    expect(code?.text).toBe("```sql\ncreate index idx_living_persons_age on persons (age)\nwhere deceased is false;\n```");
    expect(code?.marked).toBe(true);
  });

  it("marks nothing, and says so, when no unit shares enough words", () => {
    const h = highlightPassage(PARTIAL, "Storage uploads are limited to 50 MB per file on the free plan.");
    expect(h.matched).toBe(false);
    expect(h.segments.some((s) => s.marked)).toBe(false);
  });

  it("does not mark a unit that shares a single word", () => {
    // Only "index" is shared with the passage's sentences: one word is not a match.
    expect(highlightPassage(PARTIAL, "Dropping an unused index frees disk space.").matched).toBe(false);
  });

  it("marks at most two units", () => {
    const passage = "Alpha beta gamma delta epsilon. Alpha beta gamma delta epsilon again. Alpha beta gamma delta epsilon once more.";
    expect(markedText(passage, "alpha beta gamma delta epsilon")).toHaveLength(2);
  });

  it("returns segments that concatenate back to the passage exactly, for any claim", () => {
    for (const passage of [PARTIAL, HNSW, RLS]) {
      for (const claim of ["index where accuracy", "nothing in common zzz", ""]) {
        expect(highlightPassage(passage, claim).segments.map((s) => s.text).join("")).toBe(passage);
      }
    }
  });

  it("is deterministic and handles an empty claim or passage", () => {
    const claim = "build a partial index";
    expect(highlightPassage(PARTIAL, claim)).toEqual(highlightPassage(PARTIAL, claim));
    expect(highlightPassage(PARTIAL, "").matched).toBe(false);
    expect(highlightPassage("", claim)).toEqual({ segments: [], matched: false });
  });
});

describe("words and splitUnits", () => {
  it("keeps identifiers whole, drops stopwords and short tokens, and stems plurals consistently", () => {
    expect([...words("The idx_living_persons_age index, and the Indexes of rows (id)")].sort()).toEqual(["idx_living_persons_age", "index", "row"]);
    expect(words("policies")).toEqual(words("policy"));
  });

  it("splits sentences within a line and keeps fenced blocks whole, in order", () => {
    const units = splitUnits("One sentence here. Another follows.\n\n```sql\nselect 1.\n\nselect 2.\n```\n\n- A list item.");
    const text = "One sentence here. Another follows.\n\n```sql\nselect 1.\n\nselect 2.\n```\n\n- A list item.";
    expect(units.map((u) => [u.kind, text.slice(u.start, u.end)])).toEqual([
      ["prose", "One sentence here."],
      ["prose", "Another follows."],
      ["code", "```sql\nselect 1.\n\nselect 2.\n```"],
      ["prose", "- A list item."],
    ]);
  });
});

describe("codeBody", () => {
  it("drops the fence lines and keeps the code, including blank lines inside it", () => {
    expect(codeBody("```sql\nselect 1;\n\nselect 2;\n```")).toBe("select 1;\n\nselect 2;");
    expect(codeBody("~~~\nx\n~~~")).toBe("x");
  });

  it("leaves an unclosed block's body alone", () => {
    expect(codeBody("```sql\ncreate index")).toBe("create index");
  });
});
