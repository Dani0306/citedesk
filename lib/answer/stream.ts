import { openai } from "@ai-sdk/openai";
import { streamText, toUIMessageStream, type InferUIMessageChunk, type LanguageModelUsage, type ToolSet } from "ai";
import { fromText, recordCall } from "../calls/record";
import { defaultConfig, finishAnswer, prepareAnswer, type AnswerConfig, type AnswerResult, type PrepareDeps, type Reasoning } from "./answer";
import { sourceTitle } from "./prompt";
import { closestSection } from "./refusal";
import type { CiteMessage } from "./ui-message";

// The streamed answer (T28), shared by /api/chat and its tests. Sources go out before the first
// token, so the evidence is on screen while the answer is still being written; the citation check
// can only run once the text is complete, so it comes last. Same pipeline as answerQuestion.

export type CiteChunk = InferUIMessageChunk<CiteMessage>;

export type StreamGenerateFn = (args: {
  model: string;
  instructions: string;
  prompt: string;
  reasoning: Reasoning;
  maxOutputTokens: number;
}) => { chunks: ReadableStream<CiteChunk>; done: PromiseLike<{ text: string; usage: LanguageModelUsage; finishReason: string }> };

/** The real streamed answer. Reasoning summaries stay server-side; store: false as elsewhere. */
export const openaiStreamGenerate: StreamGenerateFn = ({ model, instructions, prompt, reasoning, maxOutputTokens }) => {
  const result = streamText({
    model: openai(model),
    instructions,
    prompt,
    reasoning,
    maxOutputTokens,
    timeout: 30_000,
    providerOptions: { openai: { store: false } },
  });
  return {
    chunks: toUIMessageStream<ToolSet, CiteMessage>({ stream: result.stream, sendStart: false, sendFinish: false, sendReasoning: false }),
    done: Promise.all([result.text, result.totalUsage, result.finishReason]).then(([text, usage, finishReason]) => ({ text, usage, finishReason })),
  };
};

export const REFUSAL_TEXT = "I don't know.";

function writeText(write: (c: CiteChunk) => void, id: string, text: string) {
  write({ type: "text-start", id });
  write({ type: "text-delta", id, delta: text });
  write({ type: "text-end", id });
}

function writeRefusal(write: (c: CiteChunk) => void, result: Extract<AnswerResult, { kind: "refusal" }>) {
  const c = result.closest;
  write({
    type: "data-refusal",
    id: "refusal",
    data: { reason: result.reason, closest: c ? { title: c.title, url: c.url, snippet: c.snippet, similarity: c.similarity } : null },
  });
}

/**
 * Writes one question's whole message except `finish` (the route adds it after logging) and
 * returns the result for query_log. Throws if retrieval or the model fails; the answer call is
 * logged either way, because the model stream is consumed inside recordCall.
 */
export async function streamAnswer(
  question: string,
  deps: PrepareDeps & { streamGenerate: StreamGenerateFn },
  config: AnswerConfig = defaultConfig(),
  write: (chunk: CiteChunk) => void,
): Promise<AnswerResult> {
  write({ type: "start" });
  const ready = await prepareAnswer(question, deps, config);
  if (ready.kind === "refusal") {
    writeText(write, "refusal-text", REFUSAL_TEXT);
    writeRefusal(write, ready);
    return ready;
  }

  for (const c of ready.retrieved) {
    write({ type: "source-url", sourceId: String(c.rank), url: c.sourceUrl, title: sourceTitle(c) });
    write({
      type: "data-passage",
      id: `passage-${c.rank}`,
      data: { n: c.rank, chunkKey: c.chunkKey, headingPath: c.headingPath, snippet: closestSection(c).snippet, content: c.content },
    });
  }

  const generation = await recordCall(
    deps.sink,
    { purpose: "answer", model: config.answerModel },
    async () => {
      const { chunks, done } = deps.streamGenerate({
        model: config.answerModel,
        instructions: ready.instructions,
        prompt: ready.prompt,
        reasoning: config.reasoning,
        maxOutputTokens: config.maxOutputTokens,
      });
      const reader = chunks.getReader();
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        if (value.type === "error") throw new Error(value.errorText);
        write(value);
      }
      return await done;
    },
    fromText,
  );

  const result = finishAnswer(ready, generation);
  if (result.kind === "refusal") {
    writeRefusal(write, result);
  } else {
    const { cited, invalid, uncitedSentences } = result.citations;
    write({ type: "data-citations", id: "citations", data: { cited: cited.map((x) => x.n), invalid, uncitedSentences } });
  }
  return result;
}
