# Groundedness rubric

DRAFT for the owner to edit before labelling (prompt 009). The human labeller and the LLM judge both use this exact file; the judge receives it verbatim as its instructions. Once labelling starts, change the rubric only to bring the judge closer to the human labels, and never change a label to match the judge.

## The task

You see one answer to a question about the Supabase documentation, split into sentences. Each sentence comes with the passages it cites, shown as `[n]` markers. Label every sentence with exactly one of the labels below.

Judge each sentence **only against the passages it cites**. Not against other passages, not against what you know about Supabase or Postgres, and not against what is true in the world. A sentence that is correct but whose cited passage doesn't say it is **unsupported**, because a reader who clicks the citation can't check it.

## Labels

- **supported**: every factual claim in the sentence is stated in, or follows directly from, at least one passage the sentence cites. Paraphrase is fine. Combining two cited passages is fine if each piece is in one of them.
- **unsupported**: at least one factual claim is missing from the cited passages, goes beyond them, or contradicts them. Also use this when the sentence makes a factual claim and cites nothing.
- **no_claim**: the sentence makes no checkable factual claim. Examples: a lead-in ("Here's how to do it:"), restating the question, or saying what the sources don't cover ("The sources don't say how to schedule it every five minutes.").

## Rules for hard cases

1. **Partial support is unsupported.** If a sentence has two claims and the passage supports one, the label is unsupported.
2. **Code in a sentence.** Inline code (`create index …`, `ENABLE ROW LEVEL SECURITY`) counts as a claim. It's supported only if the cited passage shows the same code, or code that differs only in names that are clearly placeholders.
3. **Code blocks are not labelled.** They aren't sentences. The sentence that introduces a code block is labelled for what it claims.
4. **Numbers, limits, defaults and versions** must appear in the cited passage. "Usually", "by default" and "always" are claims too.
5. **Hedges don't rescue a claim.** "You may be able to …" is still a claim about what is possible.
6. **Advice.** "You should use HNSW" is supported only if a cited passage recommends it (or recommends it under the conditions the sentence states).
7. **A wrong citation number** (for example `[3]` when the support is in `[2]`) makes the sentence unsupported, because the reader is sent to the wrong place. Code counts a marker that points at no source separately as a hallucinated citation.
8. **When in doubt between supported and unsupported, choose unsupported.** Its cost is a reader who can't verify the sentence.

## Worked examples

Passage [1], Managing Indexes › Partial indexes: "If you are frequently querying a subset of rows then it may be more efficient to build a partial index … `create index idx_living_persons_age on persons (age) where deceased is false;`"

| Sentence | Label | Why |
| --- | --- | --- |
| Use a `WHERE` clause in the index to cover only some rows. [1] | supported | The passage shows exactly that. |
| Partial indexes are smaller and faster to update. [1] | unsupported | Plausible, but the passage only says "may be more efficient". |
| For example, to index the age of living persons: [1] | supported | It introduces the passage's own example. |
| Here's how: | no_claim | A lead-in. |
| Partial indexes were added in Postgres 7.2. | unsupported | A factual claim with no citation (and absent from the passage). |
| The sources don't say whether partial indexes work with HNSW. | no_claim | States what the sources don't cover. |

## Output (judge only)

Return one label per sentence index, each with a reason of at most one sentence. Label every index you're given exactly once.
