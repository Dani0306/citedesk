import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { after } from "next/server";
import { z } from "zod";
import { defaultConfig, Question, type AnswerResult } from "@/lib/answer/answer";
import { CAP_MESSAGE, capReached, dailyAnswerCap } from "@/lib/answer/cap";
import { openaiStreamGenerate, streamAnswer } from "@/lib/answer/stream";
import type { CiteMessage } from "@/lib/answer/ui-message";
import { dbSink, memorySink } from "@/lib/calls/sinks";
import { answersToday } from "@/lib/db/answer-cap";
import { db } from "@/lib/db/client";
import { persistQuery, supabaseInsertQueryLog } from "@/lib/db/query-log";
import { openaiEmbed } from "@/lib/ingest/embed";
import { supabaseKeyword } from "@/lib/retrieve/keyword";
import { openaiRerank } from "@/lib/retrieve/rerank";
import { supabaseMatch } from "@/lib/retrieve/vector";
import { startTracing, traced } from "@/lib/telemetry";

// POST /api/chat (T28): one question in, one streamed cited answer or refusal out. Thin on
// purpose: parse, check the daily cap, run the shared pipeline, log, respond. Single-turn: the
// client sends only the new question, so no client-supplied history ever reaches the model.

export const maxDuration = 30;

const Body = z.object({ question: Question });

const plain = (status: number, message: string) =>
  new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return plain(400, "Send a JSON body: { \"question\": \"…\" }.");
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return plain(400, "The question must be between 1 and 2,000 characters.");
  if (capReached(await answersToday(), dailyAnswerCap())) return plain(429, CAP_MESSAGE);

  // Serverless: send this request's spans before the function can be frozen.
  after(() => startTracing().flush());

  const config = defaultConfig();
  const stream = createUIMessageStream<CiteMessage>({
    execute: async ({ writer }) => {
      const buffer = memorySink();
      let result: AnswerResult | null = null;
      try {
        result = await traced("citedesk.chat", { retrieval: config.retrieval, rerank: config.rerank }, () => streamAnswer(
          parsed.data.question,
          {
            embed: openaiEmbed,
            match: supabaseMatch(db()),
            keyword: supabaseKeyword(db()),
            rerank: openaiRerank,
            sink: buffer.sink,
            streamGenerate: openaiStreamGenerate,
          },
          config,
          (chunk) => writer.write(chunk),
        ));
      } finally {
        // Every model call is logged whatever happened; a failed log write must not break the answer.
        await persistQuery({ insertQueryLog: supabaseInsertQueryLog(db()), sink: dbSink(db()) }, result, buffer.records).catch((e) =>
          console.error("chat: logging failed", e),
        );
      }
      writer.write({ type: "finish" });
    },
    onError: (error) => {
      console.error("chat: answer failed", error);
      return "Something went wrong while answering. Please try again.";
    },
  });
  return createUIMessageStreamResponse({ stream });
}
