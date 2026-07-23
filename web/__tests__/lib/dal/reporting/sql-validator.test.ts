import { describe, expect, it } from "vitest";
import { validateReportingSql } from "@/lib/dal/reporting/sql-validator";

const ALLOWED_TABLES = ["my_animal_state", "my_farms"];

describe("validateReportingSql", () => {
  it("accepts a simple SELECT against an allowed table", () => {
    const result = validateReportingSql("SELECT * FROM my_animal_state WHERE status = 'alive'", ALLOWED_TABLES);
    expect(result.ok).toBe(true);
  });

  it("rejects multiple statements", () => {
    const result = validateReportingSql("SELECT 1; DROP TABLE my_animal_state;", ALLOWED_TABLES);
    expect(result).toEqual({ ok: false, reason: "multiple_statements" });
  });

  it("rejects non-SELECT statements", () => {
    const result = validateReportingSql("DELETE FROM my_animal_state", ALLOWED_TABLES);
    expect(result).toEqual({ ok: false, reason: "not_a_select" });
  });

  it("rejects tables outside the whitelist", () => {
    const result = validateReportingSql("SELECT * FROM user_account", ALLOWED_TABLES);
    expect(result).toEqual({ ok: false, reason: "table_not_allowed" });
  });

  it("rejects schema-qualified table references", () => {
    const result = validateReportingSql("SELECT * FROM pg_catalog.pg_roles", ALLOWED_TABLES);
    expect(result).toEqual({ ok: false, reason: "schema_qualified_table" });
  });

  it("rejects disallowed functions", () => {
    const result = validateReportingSql("SELECT pg_sleep(5) FROM my_animal_state", ALLOWED_TABLES);
    expect(result).toEqual({ ok: false, reason: "function_not_allowed" });
  });

  it("rejects CTEs", () => {
    const result = validateReportingSql(
      "WITH x AS (SELECT * FROM my_animal_state) SELECT * FROM x",
      ALLOWED_TABLES
    );
    expect(result).toEqual({ ok: false, reason: "cte_not_allowed" });
  });

  it("rejects unparseable input", () => {
    const result = validateReportingSql("not sql at all !!!", ALLOWED_TABLES);
    expect(result.ok).toBe(false);
  });

  it("appends a LIMIT when missing", () => {
    const result = validateReportingSql("SELECT * FROM my_animal_state", ALLOWED_TABLES);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sql).toContain("LIMIT 500");
  });

  it("clamps a LIMIT above the max", () => {
    const result = validateReportingSql("SELECT * FROM my_animal_state LIMIT 100000", ALLOWED_TABLES);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sql).toContain("LIMIT 500");
  });

  it("keeps a LIMIT already under the max", () => {
    const result = validateReportingSql("SELECT * FROM my_animal_state LIMIT 10", ALLOWED_TABLES);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sql).toContain("LIMIT 10");
  });

  it("allows a whitelisted aggregate function", () => {
    const result = validateReportingSql(
      "SELECT status, count(*) FROM my_animal_state GROUP BY status",
      ALLOWED_TABLES
    );
    expect(result.ok).toBe(true);
  });
});
