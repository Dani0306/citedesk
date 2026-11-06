import { openai } from "@ai-sdk/openai";
import { embedMany, type EmbeddingModelUsage } from "ai";
import { fromEmbedding, recordCall, type CallSink } from "../calls/record";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "../models";

export type EmbedFn = (values: string[]) => Promise<{ embeddings: number[][]; usage: EmbeddingModelUsage }>;

/** The real embedder: OpenAI through the AI SDK. Tests pass a fake EmbedFn instead. */
export const openaiEmbed: EmbedFn = (values) =>
  embedMany({ model: openai.embedding(EMBEDDING_MODEL), values, maxParallelCalls: 2, telemetry: { functionId: "citedesk.embed" } });

/**
 * Embeds texts in batches, one logged and priced model call per batch. Every vector is checked
 * against the column's dimension before anything is written, so a wrong model can't reach the table.
 */
export async function embedAll(
  texts: string[],
  { embed, sink, batchSize = 100, purpose = "embed_document", onBatch }: {
    embed: EmbedFn;
    sink: CallSink;
    batchSize?: number;
    purpose?: "embed_document" | "embed_query";
    onBatch?: (done: number, total: number) => void;
  },
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const { embeddings } = await recordCall(sink, { purpose, model: EMBEDDING_MODEL }, () => embed(batch), fromEmbedding);
    if (embeddings.length !== batch.length) {
      throw new Error(`Asked for ${batch.length} embeddings, got ${embeddings.length}`);
    }
    for (const e of embeddings) {
      if (e.length !== EMBEDDING_DIMENSIONS) throw new Error(`Embedding has ${e.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`);
    }
    out.push(...embeddings);
    onBatch?.(out.length, texts.length);
  }
  return out;
}
