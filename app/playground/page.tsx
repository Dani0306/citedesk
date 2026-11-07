import type { Metadata } from "next";
import Link from "next/link";
import { Container, LOGGING_NOTICE } from "../_landing/ui";
import { Playground } from "./playground";

export const metadata: Metadata = {
  title: "Retrieval playground — CiteDesk",
  description: "See how a question's candidates move through vector search, full-text search, fusion and rerank, which reached the model, and which the answer cited.",
};

// The retrieval playground (T42): public like the demo, behind the same answer cap plus a rerank cap.
export default function PlaygroundPage() {
  return (
    <main className="min-h-dvh bg-bg">
      <Container className="pt-10 pb-16 sm:pt-16">
        <div className="flex gap-4 text-sm text-ink-2">
          <Link href="/" className="underline-offset-4 hover:underline">
            ← CiteDesk
          </Link>
          <Link href="/demo" className="underline-offset-4 hover:underline">
            Demo
          </Link>
        </div>
        <header className="mt-6 max-w-2xl">
          <p className="text-eyebrow text-accent">Retrieval playground · in the lab</p>
          <h1 className="text-title mt-3 text-balance">What the model was shown, and why.</h1>
          <p className="text-lead mt-4 text-ink-2 text-pretty">
            Every candidate for one question: where vector search and full-text search ranked it, where fusion and the reranker put it, whether it
            reached the answer model, and whether the answer cited it.
          </p>
        </header>
        <div className="mt-10">
          <Playground />
        </div>
        <p className="mt-10 text-xs text-ink-2">{LOGGING_NOTICE}</p>
        <p className="mt-2 text-xs text-ink-2">Source: Supabase docs (Apache-2.0), commit aa9d04e. Not affiliated with Supabase.</p>
      </Container>
    </main>
  );
}
