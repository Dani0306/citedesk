// npm run smoke:live -- --url=https://citedesk.vercel.app [--indexable]
// The demo-mode smoke test (T43), against any base URL, local or live. Checks the pages, the
// route's input checks, one answerable question (sources before the first token, the citation check
// last, no invalid marker) and one refusal. Exits 1 on any failure. About $0.0004 and one answer
// toward the daily cap. While the project is "in the lab" every page must say noindex; pass
// --indexable after T46 to expect the opposite.
import { checkAnswerStream, checkRefusalStream, isNoindex, ogImage, parseSse } from "../lib/answer/stream-check";

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const base = (arg("url") ?? "").replace(/\/+$/, "");
const expectIndexable = process.argv.includes("--indexable");

type Step = { name: string; run: () => Promise<string[]> };
const chat = (body: string) => fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body });

const steps: Step[] = [
  ...["/", "/demo", "/playground"].map((path) => ({
    name: `GET ${path}`,
    run: async () => {
      const res = await fetch(base + path);
      const html = await res.text();
      const problems: string[] = [];
      if (res.status !== 200) problems.push(`status ${res.status}`);
      if (isNoindex(html) === expectIndexable) problems.push(expectIndexable ? "page still says noindex" : "page does not say noindex");
      return problems;
    },
  })),
  {
    name: "og:image is absolute and reachable",
    run: async () => {
      const url = ogImage(await (await fetch(base)).text());
      if (!url) return ["no og:image tag"];
      if (!/^https?:\/\//.test(url)) return [`og:image is not absolute: ${url}`];
      const res = await fetch(url);
      return res.ok && (res.headers.get("content-type") ?? "").startsWith("image/") ? [] : [`og:image returned ${res.status} ${res.headers.get("content-type")}`];
    },
  },
  {
    name: "POST /api/chat rejects bad bodies with 400",
    run: async () => {
      const problems: string[] = [];
      for (const [label, body] of [["empty question", '{"question":""}'], ["not JSON", "nope"], ["2,001 characters", JSON.stringify({ question: "a".repeat(2001) })]] as const) {
        const res = await chat(body);
        if (res.status !== 400) problems.push(`${label}: status ${res.status}, expected 400`);
      }
      return problems;
    },
  },
  {
    name: "answerable question: sources first, citations last",
    run: async () => {
      const res = await chat(JSON.stringify({ question: "How do I create a partial index?" }));
      if (res.status !== 200) return [`status ${res.status}: ${(await res.text()).slice(0, 120)}`];
      return checkAnswerStream(parseSse(await res.text())).problems;
    },
  },
  {
    name: "question outside the corpus: an honest refusal",
    run: async () => {
      const res = await chat(JSON.stringify({ question: "How do I set up TOTP MFA in Supabase Auth?" }));
      if (res.status !== 200) return [`status ${res.status}: ${(await res.text()).slice(0, 120)}`];
      return checkRefusalStream(parseSse(await res.text())).problems;
    },
  },
];

async function main() {
  if (!/^https?:\/\//.test(base)) throw new Error("Usage: npm run smoke:live -- --url=https://… (or http://localhost:3000)");
  let failed = 0;
  for (const step of steps) {
    let problems: string[];
    try {
      problems = await step.run();
    } catch (error) {
      problems = [error instanceof Error ? error.message : String(error)];
    }
    console.log(`${problems.length ? "FAIL" : "ok  "} ${step.name}`);
    for (const p of problems) console.log(`       ${p}`);
    if (problems.length) failed++;
  }
  console.log(failed ? `\n${failed} of ${steps.length} checks failed.` : `\nAll ${steps.length} checks passed against ${base}.`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
