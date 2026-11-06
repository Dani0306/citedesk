import { after } from "next/server";
import { answerQuestion, defaultConfig, openaiGenerate, type AnswerResult } from "@/lib/answer/answer";
import { CAP_MESSAGE, capReached, dailyAnswerCap, dailyRerankCap } from "@/lib/answer/cap";
import { playgroundView, PlaygroundRequest } from "@/lib/answer/playground";
import { dbSink, memorySink } from "@/lib/calls/sinks";
import { answersToday, callsToday } from "@/lib/db/answer-cap";
import { db } from "@/lib/db/client";
import { persistQuery, supabaseInsertQueryLog } from "@/lib/db/query-log";
import { openaiEmbed } from "@/lib/ingest/embed";
import { supabaseKeyword } from "@/lib/retrieve/keyword";
import { openaiRerank } from "@/lib/retrieve/rerank";
import { supabaseMatch } from "@/lib/retrieve/vector";
import { startTracing, traced } from "@/lib/telemetry";

// POST /api/playground (T42): the same pipeline as /api/chat, answered in one JSON response with
// every candidate's rank at each stage. Public like the demo, so the same answer cap applies, and
// the rerank toggle has its own smaller cap (a rerank costs about five answers).

export const maxDuration = 60;

const plain = (status: number, message: string) =>
  new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return plain(400, "Send a JSON body: { question, retrieval, rerank }.");
  }
  const parsed = PlaygroundRequest.safeParse(body);
  if (!parsed.success) return plain(400, "Send a question of 1–2,000 characters, retrieval \"vector\" or \"hybrid\", and rerank true or false.");
  if (capReached(await answersToday(), dailyAnswerCap())) return plain(429, CAP_MESSAGE);

  const { question, retrieval } = parsed.data;
  let rerank = parsed.data.rerank;
  let rerankNote: string | null = null;
  if (rerank && capReached(await callsToday("rerank"), dailyRerankCap())) {
    rerank = false;
    rerankNote = "Today's rerank limit is used up, so this ran without it. It resets at 00:00 UTC.";
  }

  after(() => startTracing().flush());
  const buffer = memorySink();
  let result: AnswerResult | null = null;
  try {
    result = await traced("citedesk.playground", { retrieval, rerank }, () =>
      answerQuestion(
        question,
        {
          embed: openaiEmbed,
          match: supabaseMatch(db()),
          keyword: supabaseKeyword(db()),
          rerank: openaiRerank,
          generate: openaiGenerate,
          sink: buffer.sink,
        },
        { ...defaultConfig(), retrieval, rerank },
      ),
    );
  } catch (error) {
    console.error("playground: answer failed", error);
    return plain(502, "Something went wrong while answering. Please try again.");
  } finally {
    await persistQuery({ insertQueryLog: supabaseInsertQueryLog(db()), sink: dbSink(db()) }, result, buffer.records).catch((e) =>
      console.error("playground: logging failed", e),
    );
  }
  const costUsd = buffer.records.reduce((s, r) => s + r.costUsd, 0);
  return Response.json(playgroundView(result, { costUsd, rerankRequested: parsed.data.rerank, rerankNote }));
}
