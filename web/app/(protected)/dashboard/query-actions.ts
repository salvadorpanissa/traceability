"use server";

import { requireSession } from "@/lib/dal/session";
import { generateReportingSql } from "@/lib/dal/reporting/generate-sql";
import { validateReportingSql } from "@/lib/dal/reporting/sql-validator";
import { withScopedReportingViews, REPORTING_VIEW_NAMES } from "@/lib/dal/reporting/scoped-views";
import { logError } from "@/lib/logger";

export type QueryResult =
  | { status: "ok"; columns: string[]; rows: Record<string, unknown>[] }
  | { status: "error"; messageKey: "cantGenerate" | "timeout" | "connectionError" };

export async function runNaturalLanguageQuery(question: string): Promise<QueryResult> {
  const session = await requireSession();

  let generatedSql: string;
  try {
    generatedSql = await generateReportingSql(question);
  } catch (error) {
    logError("runNaturalLanguageQuery.geminiFailed", error);
    return { status: "error", messageKey: "connectionError" };
  }

  const validated = validateReportingSql(generatedSql, REPORTING_VIEW_NAMES);
  if (!validated.ok) {
    logError("runNaturalLanguageQuery.sqlValidationRejected", validated);
    return { status: "error", messageKey: "cantGenerate" };
  }

  try {
    return await withScopedReportingViews(session.user.id, session.user.role, async (client) => {
      const result = await client.query(validated.sql);
      return {
        status: "ok" as const,
        columns: result.fields.map((field) => field.name),
        rows: result.rows,
      };
    });
  } catch (error) {
    if (error instanceof Error && /timeout/i.test(error.message)) {
      logError("runNaturalLanguageQuery.sqlExecutionTimedOut", error);
      return { status: "error", messageKey: "timeout" };
    }
    logError("runNaturalLanguageQuery.sqlExecutionFailed", error);
    return { status: "error", messageKey: "cantGenerate" };
  }
}
