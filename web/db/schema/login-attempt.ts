import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

// One row per failed login, used to lock out repeated guesses against a
// given email. DB-backed (not in-memory) because a serverless/multi-instance
// deployment would otherwise reset the counter on every cold start or load
// balance to an instance that never saw the earlier failures.
export const loginAttempt = pgTable(
  "login_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("login_attempt_email_attempted_at_idx").on(table.email, table.attemptedAt)]
);
