/**
 * PostgreSQL error-code helpers.
 * See https://www.postgresql.org/docs/current/errcodes-appendix.html
 */

/** Extracts a PostgreSQL SQLSTATE code from an unknown thrown error, if present. */
function pgCode(err: unknown): string | undefined {
  if (err && typeof err === "object") {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
    // Some drivers wrap the original error under `cause`.
    const cause = (err as { cause?: unknown }).cause;
    if (cause && typeof cause === "object") {
      const causeCode = (cause as { code?: unknown }).code;
      if (typeof causeCode === "string") return causeCode;
    }
  }
  return undefined;
}

/** 23503 = foreign_key_violation */
export function isForeignKeyViolation(err: unknown): boolean {
  return pgCode(err) === "23503";
}

/** 23505 = unique_violation (including errors wrapped by Drizzle). */
export function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === "23505";
}
