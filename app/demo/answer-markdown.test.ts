import { describe, expect, it } from "vitest";
import { claimBefore, parseAnswer, parseInline } from "@/app/demo/answer-markdown";

describe("parseInline", () => {
  it("turns markers, grouped markers included, into citations", () => {
    expect(parseInline("Use a where clause [1]. Both say so [2, 3].")).toEqual([
      { type: "text", text: "Use a where clause " },
      { type: "cite", n: 1 },
      { type: "text", text: ". Both say so " },
      { type: "cite", n: 2 },
      { type: "cite", n: 3 },
      { type: "text", text: "." },
    ]);
  });

  it("never reads brackets inside inline code, and keeps bold", () => {
    expect(parseInline("Run `arr[2]` **first** [1]")).toEqual([
      { type: "text", text: "Run " },
      { type: "code", text: "arr[2]" },
      { type: "text", text: " " },
      { type: "strong", text: "first" },
      { type: "text", text: " " },
      { type: "cite", n: 1 },
    ]);
  });

  it("keeps only the label of a link the model wrote anyway", () => {
    expect(parseInline("See [the guide](https://evil.example) [2]")).toEqual([
      { type: "text", text: "See the guide " },
      { type: "cite", n: 2 },
    ]);
  });
});

describe("parseAnswer", () => {
  it("splits paragraphs, lists and fenced code, and ignores markers inside code", () => {
    const blocks = parseAnswer("Create it like this [1]:\n\n```sql\nselect a[3] from t;\n```\n\n- First [2]\n- Second\n  continued [1]");
    expect(blocks).toEqual([
      { type: "p", inlines: [{ type: "text", text: "Create it like this " }, { type: "cite", n: 1 }, { type: "text", text: ":" }] },
      { type: "code", lang: "sql", text: "select a[3] from t;" },
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", text: "First " }, { type: "cite", n: 2 }],
          [{ type: "text", text: "Second continued " }, { type: "cite", n: 1 }],
        ],
      },
    ]);
  });

  it("shows a fence that is still open mid-stream as code", () => {
    expect(parseAnswer("Run this [1]:\n```sql\ncreate index")).toEqual([
      { type: "p", inlines: [{ type: "text", text: "Run this " }, { type: "cite", n: 1 }, { type: "text", text: ":" }] },
      { type: "code", lang: "sql", text: "create index" },
    ]);
  });

  it("reads numbered lists and headings, joining wrapped paragraph lines", () => {
    expect(parseAnswer("## Steps\n1. One [1]\n2. Two\n\nA long\nline.")).toEqual([
      { type: "heading", inlines: [{ type: "text", text: "Steps" }] },
      { type: "list", ordered: true, items: [[{ type: "text", text: "One " }, { type: "cite", n: 1 }], [{ type: "text", text: "Two" }]] },
      { type: "p", inlines: [{ type: "text", text: "A long line." }] },
    ]);
  });

  it("returns nothing for an empty answer", () => {
    expect(parseAnswer("")).toEqual([]);
  });
});

describe("claimBefore", () => {
  const at = (text: string, n: number) => {
    const inlines = parseInline(text);
    const i = inlines.findIndex((p) => p.type === "cite" && p.n === n);
    return claimBefore(inlines, i);
  };

  it("returns the sentence the marker closes, not the earlier ones", () => {
    const text = "Use a `WHERE` clause [1]. It makes the index smaller [2].";
    expect(at(text, 1)).toBe("Use a WHERE clause");
    expect(at(text, 2)).toBe(". It makes the index smaller");
  });

  it("gives grouped markers the same sentence, and handles a marker after the full stop", () => {
    expect(at("Both pages say so [1][3].", 3)).toBe("Both pages say so");
    expect(at("Partial indexes cover some rows. [1] They use a where clause [2].", 1)).toBe("Partial indexes cover some rows.");
  });

  it("includes inline code and bold, and is empty when nothing precedes the marker", () => {
    expect(at("Run `create index` **first** [1]", 1)).toBe("Run create index first");
    expect(at("[1] starts the answer", 1)).toBe("");
  });
});
