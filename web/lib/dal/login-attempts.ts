import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempt } from "@/db/schema";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

// Normalized the same way everywhere it's read/written so a login attempt
// with different casing can't dodge the lockout for the same account.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function isLoginLocked(email: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempt)
    .where(and(eq(loginAttempt.email, normalizeEmail(email)), gte(loginAttempt.attemptedAt, windowStart)));
  return count >= MAX_ATTEMPTS;
}

export async function recordFailedLogin(email: string): Promise<void> {
  await db.insert(loginAttempt).values({ email: normalizeEmail(email) });
}
