// supabase-js returns { data, error } instead of throwing. A missing grant (42501) or an
// unexposed schema comes back as an error, and code that reads only `data` would see "no rows".
// Every query goes through unwrap(), so an empty result always means the table is empty.

type PostgrestLikeError = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

export class DbError extends Error {
  readonly code: string | undefined;
  readonly details: string | undefined;
  readonly hint: string | undefined;

  constructor(error: PostgrestLikeError) {
    super(error.message || "Database request failed with no message");
    this.name = "DbError";
    this.code = error.code ?? undefined;
    this.details = error.details ?? undefined;
    this.hint = error.hint ?? undefined;
  }
}

export function unwrap<T>(result: { data: T | null; error: PostgrestLikeError | null }): T | null {
  if (result.error) throw new DbError(result.error);
  return result.data;
}

/** For `select(..., { count: "exact" })`: the count, or a DbError if there is none. */
export function unwrapCount(result: { count: number | null; error: PostgrestLikeError | null }): number {
  if (result.error) throw new DbError(result.error);
  if (result.count === null) throw new DbError({ message: "No count returned; was count: 'exact' requested?", code: "NO_COUNT" });
  return result.count;
}
