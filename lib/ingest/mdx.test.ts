import { describe, expect, it } from "vitest";
import { flattenHeading, inlinePartials, parseFrontmatter, parseMdx } from "@/lib/ingest/mdx";

const page = (body: string, title = "Managing Indexes") => `---\ntitle: '${title}'\ndescription: 'x'\n---\n\n${body}`;

describe("parseFrontmatter", () => {
  it("reads quoted values and returns the body", () => {
    const { data, body } = parseFrontmatter(page("Hello"));
    expect(data.title).toBe("Managing Indexes");
    expect(body.trim()).toBe("Hello");
  });
});

describe("parseMdx headings and anchors", () => {
  it("puts text before the first heading in a preamble section with no anchor", () => {
    const { sections } = parseMdx(page("Intro text.\n\n## Create an index\n\nBody."));
    expect(sections[0]).toMatchObject({ anchor: "", headingPath: ["Managing Indexes"], body: "Intro text." });
    expect(sections[1]).toMatchObject({ anchor: "create-an-index", headingPath: ["Managing Indexes", "Create an index"] });
  });

  it("matches supabase.com slugs for punctuation and inline code", () => {
    const { sections } = parseMdx(
      page("## What `:` and `!` mean in join syntax\n\nA\n\n## Option 1: CSV import via Supabase dashboard\n\nB\n\n## 1. Back up your data\n\nC"),
    );
    expect(sections.map((s) => s.anchor)).toEqual([
      "what--and--mean-in-join-syntax",
      "option-1-csv-import-via-supabase-dashboard",
      "1-back-up-your-data",
    ]);
  });

  // Each expected id was read from the live supabase.com page on 5 Nov 2026.
  it("drops underscores and pads code that touches punctuation, as the live site does", () => {
    const { sections } = parseMdx(
      page(
        "## `http_get`\n\nA\n\n### Euclidean L2 distance (`vector_l2_ops`)\n\nB\n\n### Inner join (`!inner`)\n\nC\n\n" +
          "### 5. Configure `pg_partman` (optional)\n\nD\n\n### `service_role`\n\nE",
      ),
    );
    expect(sections.map((s) => s.anchor)).toEqual([
      "httpget",
      "euclidean-l2-distance--vectorl2ops-",
      "inner-join--inner-",
      "5-configure-pgpartman-optional",
      "servicerole",
    ]);
    expect(sections[1].headingPath.at(-1)).toBe("Euclidean L2 distance (vector_l2_ops)");
  });

  it("keeps headings inside tabs as text, since the site gives them no id", () => {
    const md = page('### Returning data sets\n\nIntro.\n\n<Tabs\n  size="small"\n>\n<TabPanel id="data" label="Data">\n\n#### Planets\n\nRows.\n\n</TabPanel>\n</Tabs>\n\n### Passing parameters\n\nP.');
    const { sections } = parseMdx(md);
    expect(sections.map((s) => s.anchor)).toEqual(["returning-data-sets", "passing-parameters"]);
    expect(sections[0].body).toContain("Planets");
    expect(sections[0].body).toContain("Rows.");
  });

  it("uses an explicit [#id] and strips it from the heading text", () => {
    const { sections } = parseMdx(page("### `to_tsvector()` [#to-tsvector]\n\nBody"));
    expect(sections[0].anchor).toBe("to-tsvector");
    expect(sections[0].headingPath.at(-1)).toBe("to_tsvector()");
  });

  it("numbers repeated headings within a page", () => {
    const { sections } = parseMdx(page("#### Result\n\nA\n\n#### Result\n\nB"));
    expect(sections.map((s) => s.anchor)).toEqual(["result", "result-1"]);
  });

  it("builds the heading path from nesting and pops on a shallower heading", () => {
    const { sections } = parseMdx(page("## A\n\nx\n\n### B\n\ny\n\n## C\n\nz"));
    expect(sections.map((s) => s.headingPath.slice(1))).toEqual([["A"], ["A", "B"], ["C"]]);
  });

  it("never treats a # inside a code fence, even an indented one, as a heading", () => {
    const md = page("## Setup\n\n<TabPanel id=\"sh\" label=\"Shell\">\n    ```bash\n    # install the CLI\n    npm i\n    ```\n</TabPanel>");
    const { sections } = parseMdx(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].body).toContain("# install the CLI");
    expect(sections[0].body).not.toContain("TabPanel");
  });

  it("drops a heading with no body but keeps it in its children's paths", () => {
    const { sections } = parseMdx(page("## Parent\n\n### Child\n\nText"));
    expect(sections).toHaveLength(1);
    expect(sections[0].headingPath).toEqual(["Managing Indexes", "Parent", "Child"]);
  });
});

describe("parseMdx content cleaning", () => {
  it("removes wrapper component tags but keeps their text", () => {
    const md = page('## Note\n\n<Admonition type="note">\n\nRun it in the SQL Editor.\n\n</Admonition>');
    const body = parseMdx(md).sections[0].body;
    expect(body).toBe("Run it in the SQL Editor.");
  });

  it("drops decorative components, including multi-line props", () => {
    const md = page('## Pic\n\nBefore.\n\n<Image\n  alt="diagram"\n  src={{ light: "/a.png" }}\n/>\n\nAfter.');
    expect(parseMdx(md).sections[0].body).toBe("Before.\n\nAfter.");
  });

  it("removes MDX comments and top-level ESM, but not code that looks like them", () => {
    const md = page(
      "import { Foo } from 'bar'\n\n## Env\n\n{/* hidden */}\nVisible.\n\n```bash\nexport OLD_PROJECT_REF=abc\n```",
    );
    const body = parseMdx(md).sections[0].body;
    expect(body).not.toContain("hidden");
    expect(body).not.toContain("import { Foo }");
    expect(body).toContain("export OLD_PROJECT_REF=abc");
  });

  it("inlines partials before parsing, so their headings become sections", () => {
    const read = (p: string) => (p === "setup.mdx" ? "---\ntitle: x\n---\n### From partial\n\nShared text." : null);
    const { sections } = parseMdx(page('## Start\n\nA\n\n<$Partial path="setup.mdx" />'), read);
    expect(sections.at(-1)).toMatchObject({ anchor: "from-partial", body: "Shared text." });
  });

  it("fails loudly on a missing partial", () => {
    expect(() => inlinePartials('<$Partial path="nope.mdx" />', () => null)).toThrow(/nope\.mdx/);
  });
});

describe("flattenHeading", () => {
  it("keeps link labels and code text, drops emphasis", () => {
    expect(flattenHeading("Using [**pgvector**](/docs) with `vector(1536)`")).toBe("Using pgvector with vector(1536)");
  });

  it("never reads underscores inside identifiers or code as italics", () => {
    expect(flattenHeading("log_min_duration_statement and `vector_l2_ops`")).toBe("log_min_duration_statement and vector_l2_ops");
    expect(flattenHeading("an _emphasised_ word")).toBe("an emphasised word");
  });
});
