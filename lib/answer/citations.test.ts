import { describe, expect, it } from "vitest";
import { checkCitations } from "@/lib/answer/citations";

const chunks = [{ id: 101 }, { id: 102 }, { id: 103 }];

describe("checkCitations", () => {
  it("maps valid markers to chunk ids in first-use order, without duplicates", () => {
    const r = checkCitations("Use a where clause [2]. It shrinks the index [2][1].", chunks);
    expect(r.cited).toEqual([
      { n: 2, chunkId: 102 },
      { n: 1, chunkId: 101 },
    ]);
    expect(r.invalid).toEqual([]);
    expect(r.uncitedSentences).toBe(0);
  });

  it("reads grouped markers like [1, 3]", () => {
    expect(checkCitations("Both pages say so [1, 3].", chunks).cited.map((c) => c.n)).toEqual([1, 3]);
  });

  it("counts every out-of-range marker, including [0], as invalid", () => {
    const r = checkCitations("Made up [4]. Also [0]. And again [4].", chunks);
    expect(r.invalid).toEqual([4, 0, 4]);
    expect(r.cited).toEqual([]);
  });

  it("ignores brackets inside fenced code, inline code and links", () => {
    const answer = [
      "Create it like this [1]:",
      "",
      "```sql",
      "select arr[5] from t;",
      "```",
      "",
      "The `arr[7]` syntax indexes arrays, see [the guide](https://x.dev/[9]) [3].",
    ].join("\n");
    const r = checkCitations(answer, chunks);
    expect(r.invalid).toEqual([]);
    expect(r.cited.map((c) => c.n)).toEqual([1, 3]);
  });

  it("does not treat footnotes or words in brackets as markers", () => {
    const r = checkCitations("See the note [^1] and the [optional] flag [2].", chunks);
    expect(r.cited.map((c) => c.n)).toEqual([2]);
    expect(r.invalid).toEqual([]);
  });

  it("counts prose sentences with no marker, wherever the marker sits around the full stop", () => {
    const answer = "Partial indexes cover some rows. [1] They use a where clause [1]. This part has no source at all.\n\n- Each list item is checked too [2].\n- This item cites nothing here.";
    expect(checkCitations(answer, chunks).uncitedSentences).toBe(2);
  });

  it("skips headings, tables and short fragments when counting", () => {
    const answer = "## Steps\n\n| a | b |\n|---|---|\n\nDone.\n\nRun `create index` first [1].";
    expect(checkCitations(answer, chunks).uncitedSentences).toBe(0);
  });
});
