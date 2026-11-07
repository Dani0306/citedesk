# CiteDesk: an "ask the docs" assistant that has to show its work

**Status: draft, not published.** This is written to be pasted into danielcolorado.dev when the project leaves "In the lab". Every number comes from a run file or the call log in the repository; where a number doesn't exist yet, this says **Pending** instead of guessing.

## The problem

People ask the same questions about documentation again and again. Keyword search misses a question worded differently from the page, and a generic chatbot answers confidently with nothing you can check. For a support team, a new hire or a student, an answer that can't be verified is worse than no answer, because it gets repeated.

So the brief for CiteDesk was narrow: answer **only** from a given set of documents, put a citation on **every sentence** that links to the exact section it came from, and say "I don't know" when the documents don't cover the question.

I built it over a corpus I could legally ingest and that a stranger can check against a live site: the Supabase Database and AI guides (Apache-2.0, pinned to one commit). The product is small. The point of the project is the other half: **a way to measure whether it works.**

## The claim is evidence, not features

Commercial tools in this space already advertise citations and a refusal behaviour. Of the vendor pages I read, none published retrieval ablations, so a reader can't tell how well they find the right passage. CiteDesk's README therefore compares nothing it hasn't measured, and it reports one number the product can be held to: **hallucinated citations, checked in code, target 0**.

## What I built

- An **ingest pipeline** that chunks by the documents' own headings and verifies every citation anchor against the live site (997 of 997 matched).
- **Hybrid retrieval**: pgvector similarity and Postgres full-text search, fused with reciprocal rank fusion, with an optional LLM rerank. Each stage can be switched on or off and measured on its own.
- **Answers with `[n]` markers** that code validates against the chunks retrieved for that question, a refusal decided from the top similarity score before the answer model is called, and sources streamed before the first word of the answer.
- An **eval suite**: retrieval metrics (recall@k, MRR, nDCG), a groundedness judge calibrated against hand labels, a diagnosis table that attributes each failure to retrieval or generation, and a regression gate in CI.

## Decisions that mattered, and what I rejected

**Citations as validated markers, not a provider feature.** A hosted file-search tool would have retrieved with its own index and chunking and hidden the exact thing I wanted to measure. With markers, "does every citation point at something that was retrieved" is a deterministic count.

**Refusal in code, from a retrieval score.** Gating before the model is called costs nothing and can't be talked around by a model that already "knows" Supabase from training. The model's own "I don't know" is a second, weaker net.

**Labels keyed to sections, not row ids.** Chunk size is an open question, and changing it re-chunks everything. Labelling a section key (page plus anchor) keeps every label valid, while scoring still happens on chunk ranks, so each section is credited once and a long section split in two can't score twice.

**Prompt caching as a measured bet.** Caching only reuses the beginning of a prompt, and our beginning (the instructions) is shorter than the minimum, so only *exact repeat questions* hit the cache, while every new prompt pays 25% extra to write it. I measured both sides rather than assuming: on four questions per pass, caching pays above about 31% repeats, for both retrieval configurations (see the README's cost block; n is tiny, so it measures the mechanism, not a benchmark).

## What went wrong, and what it taught me

These are the findings I'd want a reviewer to see, because each one changed the design.

- **A `LIMIT 50` query quietly returned 40 rows.** pgvector's HNSW index caps results at `ef_search`, 40 by default. Nothing errors; recall just silently drops. I measured it, then made the database function raise the setting to match the requested count on every call.
- **Keyword search found nothing.** The documented full-text recipe requires every word of the query to match. For sentence-length questions that matched 0 of 835 chunks. Matching any word and letting rank order do the work fixed it.
- **A stub page produced a confident, wrong-sourced answer.** One docs page is a single line pointing to a guide I hadn't ingested. A question about it scored just above the refusal threshold, and the model answered from memory, citing an unrelated section. The citation was *valid* (it pointed at a retrieved passage) and the claim was *unsupported*. That is exactly why citation checking and groundedness judging are separate numbers.
- **The refusal threshold is too strict for paraphrases.** Questions worded differently from the docs retrieved the right sections but scored below my provisional 0.60 and were refused. I only have a handful of test questions so far, which is why the value is still labelled provisional and tuning it is blocked on the unanswerable-question set rather than on code.
- **Real docs don't parse the way the framework says.** Anchors matched 96.8% on the first pass and 100% only after reading how the live site actually generates them (underscores dropped, code beside punctuation padded, no ids inside tabs).

## Results

The headline numbers need a hand-labelled question set, and writing it is the one part I'm doing myself, because labels written from the system's own output would flatter it.

- **Retrieval ablation** (naive vector, hybrid, hybrid + rerank on 40 labelled questions): **Pending.** See the README's evidence section.
- **Groundedness and judge calibration** (target: at least 85% agreement with 30 hand labels, reported with Cohen's kappa and the confusion matrix, because raw agreement alone can hide a judge that says "supported" almost every time): **Pending.**
- **Hallucinated citations** (checked in code, must be 0): **Pending** a full run.
- **Cost.** The whole project's logged model calls total **$0.036 over 161 calls**, of which embedding the entire corpus was $0.0043. Measured per question (four questions, see the README's cost block): about $0.0003 for a plain-vector answer and about $0.0017 with hybrid retrieval and rerank, where the rerank call is most of the cost.

## What I'd do next

1. Finish the 40 + 10 questions, run the baseline and the ablation, and publish the table whichever way it falls, including if the reranker turns out not to be worth its latency.
2. Tune the refusal threshold on the unanswerable set and re-check the paraphrase case.
3. Add metadata filters, query rewriting for follow-up questions, and Spanish questions against English docs.

## Stack and cost

Next.js, TypeScript, Tailwind, the Vercel AI SDK, OpenAI (`gpt-6-luna` for answers, `text-embedding-3-small`), Supabase Postgres with pgvector, Langfuse for traces, Vitest, GitHub Actions. Hosting and tracing run on free tiers; a global daily cap keeps worst-case model spend near $4 a month.
