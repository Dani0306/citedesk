// Prices copied from the pricing page, never estimated. Update the table and the date together,
// and only from the page itself.
export const PRICING_SOURCE = "https://developers.openai.com/api/docs/pricing";
export const PRICING_READ_ON = "2026-11-05";

type ChatPrice = {
  kind: "chat";
  input: number;
  cachedInput: number;
  /** 30-minute cache write, the default TTL for GPT-5.6 and later. This project never sets 12h. */
  cacheWrite: number;
  output: number;
};
type EmbeddingPrice = { kind: "embedding"; input: number };

/** USD per 1M tokens, standard tier, short context (≤272K input tokens). */
export const PRICES: Record<string, ChatPrice | EmbeddingPrice> = {
  "gpt-6-luna": { kind: "chat", input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5 },
  "gpt-6.1-sol": { kind: "chat", input: 2.0, cachedInput: 0.1, cacheWrite: 2.5, output: 10.0 },
  "gpt-6.1-terra": { kind: "chat", input: 1.0, cachedInput: 0.05, cacheWrite: 1.25, output: 5.0 },
  "text-embedding-3-small": { kind: "embedding", input: 0.02 },
};

/** Input split by how it is billed. Reasoning tokens are already inside outputTokens. */
export type BilledTokens = {
  noCacheInputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
};

export class UnknownModelPriceError extends Error {
  constructor(model: string) {
    super(`No price for "${model}" in lib/cost/pricing.ts. Copy it from ${PRICING_SOURCE} first.`);
    this.name = "UnknownModelPriceError";
  }
}

export function priceFor(model: string): ChatPrice | EmbeddingPrice {
  const price = PRICES[model];
  if (!price) throw new UnknownModelPriceError(model);
  return price;
}

export function callCostUsd(model: string, tokens: BilledTokens): number {
  const price = priceFor(model);
  let perMillion: number;
  if (price.kind === "embedding") {
    if (tokens.cachedInputTokens || tokens.cacheWriteTokens || tokens.outputTokens) {
      throw new Error(`"${model}" is an embedding model; it has no cached-input, cache-write or output price.`);
    }
    perMillion = tokens.noCacheInputTokens * price.input;
  } else {
    perMillion =
      tokens.noCacheInputTokens * price.input +
      tokens.cachedInputTokens * price.cachedInput +
      tokens.cacheWriteTokens * price.cacheWrite +
      tokens.outputTokens * price.output;
  }
  // Prices are per 1M tokens. Keep 8 decimals so a $0.000002 embedding call doesn't round to zero.
  return Math.round((perMillion / 1e6) * 1e8) / 1e8;
}
