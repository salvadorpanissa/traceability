import { customType } from "drizzle-orm/pg-core";

// drizzle-orm has no built-in bytea helper; this is its documented customType
// pattern for storing raw binary (e.g. an uploaded guide PDF). node-postgres
// round-trips bytea as a Buffer natively, so no toDriver/fromDriver is needed.
//
// Gotcha: drizzle-kit's SQL generator only recognizes a fixed allowlist of
// native Postgres type names, and "bytea" isn't on it — `drizzle-kit generate`
// will emit any ALTER/CREATE touching this column with the type wrongly
// quoted as `"bytea"` (treated like a schema-qualified enum/domain name
// instead of the builtin type), which fails on migrate. Always inspect
// generated SQL for statements touching a bytea column and manually strip
// the quotes before running it.
export const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});
