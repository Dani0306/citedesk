// The only place model IDs live. Answer and escalation models are overridable
// from the environment so an eval run can swap them without code changes.
// The embedding model is not: the chunks.embedding column is vector(1536),
// so changing it means a migration and a full re-embed.

export const DEFAULT_ANSWER_MODEL = "gpt-6-luna";
export const DEFAULT_ESCALATION_MODEL = "gpt-6.1-sol";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export function answerModel(): string {
  return process.env.CITEDESK_ANSWER_MODEL || DEFAULT_ANSWER_MODEL;
}

export function escalationModel(): string {
  return process.env.CITEDESK_ESCALATION_MODEL || DEFAULT_ESCALATION_MODEL;
}
