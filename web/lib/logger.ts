// A one-line JSON-per-error log instead of a bare `console.error(msg, error)`
// dump. Every error a user hits on the Electron desktop build is otherwise
// unrecoverable — stdout isn't retrievable from their machine — so at
// minimum production errors should come out in a shape a log-shipping
// service (Sentry, Datadog, etc.) can ingest without a rewrite once one is
// wired up. No external service is configured yet; this only changes the
// shape of what already goes to stdout/stderr.
type LogContext = Record<string, unknown>;

function serializeError(error: unknown): { message: string; stack?: string } | unknown {
  if (error instanceof Error) return { message: error.message, stack: error.stack };
  return error;
}

export function logError(event: string, error: unknown, context?: LogContext): void {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      error: serializeError(error),
      ...context,
      timestamp: new Date().toISOString(),
    })
  );
}
