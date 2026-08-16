import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userAccount, role } from "@/db/schema";

export type ProvisionedUser = { id: string; name: string; email: string; role: string };

// Google already verifies the email, so linking an existing password
// account by email match on Google sign-in is safe here (no confirmation
// step needed) — see docs/superpowers/specs/2026-08-15-google-auth-design.md.
export async function findOrCreateUserForGoogle(email: string, name: string): Promise<ProvisionedUser> {
  const [existing] = await db
    .select({ id: userAccount.id, name: userAccount.name, email: userAccount.email, roleName: role.name })
    .from(userAccount)
    .innerJoin(role, eq(userAccount.roleId, role.id))
    .where(sql`lower(${userAccount.email}) = lower(${email})`)
    .limit(1);

  if (existing) {
    return { id: existing.id, name: existing.name, email: existing.email, role: existing.roleName };
  }

  const [managerRole] = await db.select().from(role).where(eq(role.name, "manager")).limit(1);
  if (!managerRole) {
    throw new Error('Role "manager" not found — run db seed before allowing Google sign-in');
  }

  const [created] = await db
    .insert(userAccount)
    .values({ name, email, passwordHash: null, roleId: managerRole.id })
    .returning({ id: userAccount.id, name: userAccount.name, email: userAccount.email });

  return { id: created.id, name: created.name, email: created.email, role: managerRole.name };
}
