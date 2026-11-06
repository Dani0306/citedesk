import { describe, expect, it } from "vitest";
import { memorySink } from "@/lib/calls/sinks";
import { DbError } from "@/lib/db/result";
import type { EmbedFn } from "@/lib/ingest/embed";
import { EMBEDDING_DIMENSIONS } from "@/lib/models";
import { supabaseMatch, vectorSearch, type MatchFn } from "@/lib/retrieve/vector";

const embed: EmbedFn = async (values) => ({
  embeddings: values.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1)),
  usage: { tokens: 7 },
});

const row = (id: number, similarity: number) => ({
  id,
  chunk_key: `database/postgres/indexes#s${id}`,
  heading_path: ["Indexes", `S${id}`],
  anchor: `s${id}`,
  source_url: `https://supabase.com/docs/guides/database/postgres/indexes#s${id}`,
  content: `Chunk ${id}`,
  similarity,
});

describe("vectorSearch", () => {
  it("embeds once as a query, asks for k rows and ranks them", async () => {
    const asked: number[] = [];
    const match: MatchFn = async (_, count) => {
      asked.push(count);
      return [row(4, 0.7), row(9, 0.5)];
    };
    const { records, sink } = memorySink();
    const chunks = await vectorSearch("partial index?", 8, { embed, match, sink });

    expect(asked).toEqual([8]);
    expect(chunks.map((c) => [c.id, c.rank, c.chunkKey])).toEqual([
      [4, 1, "database/postgres/indexes#s4"],
      [9, 2, "database/postgres/indexes#s9"],
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ purpose: "embed_query", inputTokens: 7, outcome: "ok" });
  });

  it("returns an empty list for an empty table", async () => {
    const { sink } = memorySink();
    expect(await vectorSearch("q", 8, { embed, match: async () => [], sink })).toEqual([]);
  });

  it("throws on rows of the wrong shape instead of guessing", async () => {
    const { sink } = memorySink();
    await expect(vectorSearch("q", 8, { embed, match: async () => [{ id: 1 }], sink })).rejects.toThrow();
  });

  it("rejects a k the SQL function would refuse, before spending anything", async () => {
    const { records, sink } = memorySink();
    await expect(vectorSearch("q", 201, { embed, match: async () => [], sink })).rejects.toThrow(/between 1 and 200/);
    expect(records).toHaveLength(0);
  });
});

describe("supabaseMatch", () => {
  it("turns an RPC error into a DbError, never zero rows", async () => {
    const client = { rpc: async () => ({ data: null, error: { message: "permission denied", code: "42501" } }) };
    await expect(supabaseMatch(client)([0.1], 5)).rejects.toBeInstanceOf(DbError);
  });
});
