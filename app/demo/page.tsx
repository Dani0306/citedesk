import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "../_landing/ui";
import { Chat } from "./chat";

export const metadata: Metadata = {
  title: "Demo — CiteDesk",
  description: "Ask the Supabase Database and AI docs. Every sentence cites the passage it came from, or the answer is “I don't know.”",
};

// Demo mode (T31): public, no login, sample questions preloaded. The page is static; only the chat
// is a client island, and it talks to /api/chat, which holds the keys and the daily cap.
export default function DemoPage() {
  return (
    <main className="min-h-dvh bg-bg">
      <Container className="pt-10 sm:pt-16">
        <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-ink-2 underline-offset-4 hover:underline">
          ← CiteDesk
        </Link>
        <header className="mt-6">
          <p className="text-eyebrow text-accent">Demo · in the lab</p>
          <h1 className="text-title mt-3 text-balance">Ask the Supabase docs.</h1>
          <p className="text-lead mt-4 text-ink-2 text-pretty">
            Answers come only from the Database and AI guides. Every sentence cites the passage behind it, the sources show up
            before the answer does, and when the docs don&apos;t cover a question the answer is “I don&apos;t know.”
          </p>
        </header>
        <div className="mt-10">
          <Chat />
        </div>
        <p className="py-8 text-xs text-ink-2">Source: Supabase docs (Apache-2.0), commit aa9d04e. Not affiliated with Supabase.</p>
        </div>
      </Container>
    </main>
  );
}
