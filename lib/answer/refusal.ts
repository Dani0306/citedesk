import { MODEL_REFUSAL, sourceTitle } from "./prompt";
import type { RetrievedChunk } from "../retrieve/vector";

// The refusal rule (T16). Refusal is decided in code from the rank-1 chunk's cosine similarity
// (T02) before the answer model is called, so a model that "knows" Supabase can't talk its way
// past it. The model's own "I don't know." is a second, weaker net.

/**
 * PROVISIONAL until T33 sweeps it against the 10 unanswerable questions. Measured 5 Nov 2026 from
 * 10 probes (prompt 005): in-scope rank-1 scores 0.664–0.721, out-of-corpus topics 0.341–0.501.
 * Set just below the lowest in-scope score. Known leak: database/extensions/pg_cron is a one-line
 * stub pointing at guides/cron (not ingested), and pg_cron questions score ~0.60–0.73 on it.
 */
export const PROVISIONAL_REFUSAL_THRESHOLD = 0.6;

export const REFUSAL_REASONS = ["low_score", "not_in_sources", "no_matches"] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

export type Threshold = { value: number; source: "env" | "provisional" };

export function refusalThreshold(env: Record<string, string | undefined> = process.env): Threshold {
  const raw = env.CITEDESK_REFUSAL_THRESHOLD?.trim();
  if (!raw) return { value: PROVISIONAL_REFUSAL_THRESHOLD, source: "provisional" };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`CITEDESK_REFUSAL_THRESHOLD must be a number between 0 and 1, got "${raw}"`);
  }
  return { value, source: "env" };
}

/** Returns the reason to refuse before prompting, or null to go on and answer. */
export function gate(chunks: Pick<RetrievedChunk, "similarity">[], threshold: number): RefusalReason | null {
  if (chunks.length === 0) return "no_matches";
  return chunks[0].similarity < threshold ? "low_score" : null;
}

/** The model followed rule 5. Tolerates a curly apostrophe and a missing full stop, nothing more. */
export function isModelRefusal(text: string): boolean {
  const said = text.trim().replace(/[‘’]/g, "'").replace(/\.$/, "").toLowerCase();
  return said === MODEL_REFUSAL.replace(/\.$/, "").toLowerCase();
}

export type ClosestSection = {
  chunkKey: string;
  title: string;
  /** Already carries the section anchor. */
  url: string;
  snippet: string;
  similarity: number;
};

export function closestSection(chunk: RetrievedChunk, maxChars = 240): ClosestSection {
  const flat = chunk.content.replace(/^ {0,3}(`{3,}|~{3,}).*$/gm, "").replace(/\s+/g, " ").trim();
  const space = flat.lastIndexOf(" ", maxChars);
  const snippet = flat.length <= maxChars ? flat : `${flat.slice(0, space > 0 ? space : maxChars)}…`;
  return { chunkKey: chunk.chunkKey, title: sourceTitle(chunk), url: chunk.sourceUrl, snippet, similarity: chunk.similarity };
}
