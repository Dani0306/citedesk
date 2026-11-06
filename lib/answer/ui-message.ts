import type { UIMessage } from "ai";
import type { RefusalReason } from "./refusal";

// The message shape /api/chat streams and the /demo chat renders. Sources travel as the SDK's own
// `source-url` parts (sourceId = the marker number); these data parts carry what that shape has
// no room for. Types only, so the client can import it without pulling in server code.

export type PassageData = {
  /** The marker number: [n] in the answer cites this passage. */
  n: number;
  chunkKey: string;
  headingPath: string[];
  snippet: string;
  content: string;
};

export type CitationsData = {
  /** Valid marker numbers in first-use order. */
  cited: number[];
  /** Markers that point at no retrieved source: hallucinated citations, target 0. */
  invalid: number[];
  uncitedSentences: number;
};

export type RefusalData = {
  reason: RefusalReason;
  closest: { title: string; url: string; snippet: string; similarity: number } | null;
};

export type CiteMessage = UIMessage<never, { passage: PassageData; citations: CitationsData; refusal: RefusalData }>;
