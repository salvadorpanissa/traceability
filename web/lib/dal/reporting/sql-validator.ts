import { Parser } from "node-sql-parser";

const parser = new Parser();

const MAX_ROW_LIMIT = 500;

const ALLOWED_FUNCTIONS = new Set([
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "now",
  "coalesce",
  "lower",
  "upper",
  "trim",
  "round",
  "extract",
  "date_trunc",
  "to_char",
  "concat",
  "length",
  "cast",
]);

export type SqlValidationResult = { ok: true; sql: string } | { ok: false; reason: string };

// Walks the whole AST tree structurally (not tied to specific known keys) so
// function calls nested in subqueries, HAVING, ORDER BY, etc. are all found
// regardless of node-sql-parser's exact shape at each location.
function collectFunctionNames(node: unknown, names: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectFunctionNames(item, names);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj.type === "aggr_func" && typeof obj.name === "string") {
      names.add(obj.name.toLowerCase());
    }
    if (obj.type === "function" && obj.name && typeof obj.name === "object") {
      const nameParts = (obj.name as { name?: { value?: string }[] }).name;
      if (Array.isArray(nameParts)) {
        for (const part of nameParts) {
          if (part && typeof part.value === "string") names.add(part.value.toLowerCase());
        }
      }
    }
    for (const value of Object.values(obj)) collectFunctionNames(value, names);
  }
}

export function validateReportingSql(rawSql: string, allowedTables: readonly string[]): SqlValidationResult {
  let ast;
  try {
    ast = parser.astify(rawSql, { database: "postgresql" });
  } catch {
    return { ok: false, reason: "not_parseable" };
  }

  if (Array.isArray(ast)) {
    return { ok: false, reason: "multiple_statements" };
  }
  if (ast.type !== "select") {
    return { ok: false, reason: "not_a_select" };
  }
  if (ast.with) {
    return { ok: false, reason: "cte_not_allowed" };
  }

  let tableList: string[];
  try {
    tableList = parser.tableList(rawSql, { database: "postgresql" });
  } catch {
    return { ok: false, reason: "not_parseable" };
  }

  const allowed = new Set(allowedTables.map((t) => t.toLowerCase()));
  for (const entry of tableList) {
    const [, schemaName, tableName] = entry.split("::");
    if (schemaName && schemaName !== "null") {
      return { ok: false, reason: "schema_qualified_table" };
    }
    if (!allowed.has(tableName.toLowerCase())) {
      return { ok: false, reason: "table_not_allowed" };
    }
  }

  const functionNames = new Set<string>();
  collectFunctionNames(ast, functionNames);
  for (const name of functionNames) {
    if (!ALLOWED_FUNCTIONS.has(name)) {
      return { ok: false, reason: "function_not_allowed" };
    }
  }

  if (!ast.limit || ast.limit.value.length === 0) {
    ast.limit = { seperator: "", value: [{ type: "number", value: MAX_ROW_LIMIT }] };
  } else {
    const current = ast.limit.value[0];
    if (current.type === "number" && current.value > MAX_ROW_LIMIT) {
      current.value = MAX_ROW_LIMIT;
    }
  }

  const sql = parser.sqlify(ast, { database: "postgresql" });
  return { ok: true, sql };
}
