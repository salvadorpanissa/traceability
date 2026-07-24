// The `pg` driver reports a unique-constraint violation as error.code "23505"
// (Postgres' unique_violation SQLSTATE) — used to turn a duplicate-name
// insert/update into a friendly message instead of an unhandled rejection.
//
// drizzle-orm wraps driver errors in a DrizzleQueryError, putting the
// original pg error (with .code) on `.cause` instead of on the top-level
// error, so the check has to walk the cause chain.
export function isUniqueViolationError(error: unknown): boolean {
  let current: unknown = error;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && (current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
