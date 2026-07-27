import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { role, userAccount } from "@/db/schema";

const SYSTEM_USER_EMAIL = process.env.SYSTEM_USER_EMAIL ?? "sistema@interno.local";
const SYSTEM_USER_NAME = "Sistema (recategorización automática)";

// Provisions (once) the service account used as created_by for events a
// scheduled job generates, not a real user action. Its password is a
// random, never-communicated bcrypt hash — this account can never log in,
// it only exists to satisfy event/batch_operation's not-null created_by.
export async function getOrCreateSystemUser(): Promise<string> {
  const [existing] = await db.select().from(userAccount).where(eq(userAccount.email, SYSTEM_USER_EMAIL));
  if (existing) return existing.id;

  const roles = await db.select().from(role);
  const chosenRole = roles.find((r) => r.name === "admin") ?? roles[0];
  if (!chosenRole) {
    throw new Error("No hay ningún rol configurado; corré npm run db:seed primero");
  }

  const passwordHash = await bcrypt.hash(randomUUID(), 10);
  const [created] = await db
    .insert(userAccount)
    .values({ name: SYSTEM_USER_NAME, email: SYSTEM_USER_EMAIL, passwordHash, roleId: chosenRole.id })
    .onConflictDoNothing({ target: userAccount.email })
    .returning();
  if (created) return created.id;

  // A concurrent first-call (e.g. CLI and cron overlapping on a cold start)
  // won the race and inserted first; onConflictDoNothing silently skipped
  // our insert, so re-select the row it created.
  const [winner] = await db.select().from(userAccount).where(eq(userAccount.email, SYSTEM_USER_EMAIL));
  if (!winner) {
    throw new Error("No se pudo crear ni recuperar el usuario del sistema tras un conflicto de concurrencia");
  }
  return winner.id;
}
