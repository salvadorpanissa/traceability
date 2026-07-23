// The `pg` driver reports a unique-constraint violation as error.code "23505"
// (Postgres' unique_violation SQLSTATE) — used to turn a duplicate-name
// insert/update into a friendly message instead of an unhandled rejection.
export function isUniqueViolationError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}
