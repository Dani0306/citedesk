import { describe, expect, it } from "vitest";
import { DbError, unwrap, unwrapCount } from "@/lib/db/result";

const denied = { message: "permission denied for schema citedesk", code: "42501", details: null, hint: null };

describe("unwrap", () => {
  it("throws a coded DbError instead of returning empty data on a grant failure", () => {
    expect(() => unwrap({ data: null, error: denied })).toThrow(DbError);
    try {
      unwrap({ data: [], error: denied });
    } catch (e) {
      expect(e).toBeInstanceOf(DbError);
      expect((e as DbError).code).toBe("42501");
    }
  });

  it("returns an empty array when the query succeeded with no rows", () => {
    expect(unwrap({ data: [], error: null })).toEqual([]);
  });

  it("returns the data when there is no error", () => {
    expect(unwrap({ data: [{ id: 1 }], error: null })).toEqual([{ id: 1 }]);
  });

  it("keeps a message even when the server sent none", () => {
    expect(() => unwrap({ data: null, error: { message: "" } })).toThrow(/no message/);
  });
});

describe("unwrapCount", () => {
  it("returns zero for an empty table", () => {
    expect(unwrapCount({ count: 0, error: null })).toBe(0);
  });

  it("throws on an error even if a count is present", () => {
    expect(() => unwrapCount({ count: 0, error: denied })).toThrow(DbError);
  });

  it("throws when no count came back", () => {
    expect(() => unwrapCount({ count: null, error: null })).toThrow(/count/);
  });
});
