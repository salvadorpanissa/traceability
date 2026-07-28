import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { userAccount, role } from "@/db/schema";

// redirect() (not throw) because this runs in a Server Component render path
// (app/(protected)/layout.tsx) where a thrown Error would bubble past any
// error.tsx in the same segment straight to the nearest parent boundary —
// there isn't one, so an expired session would show a raw crash screen
// instead of sending the user back to /login.
export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // If AUTH_SECRET is ever leaked, it must not be enough on its own to
  // grant admin: re-derive the role from the DB on every request instead of
  // trusting whatever role the signed JWT claims. A forged token can still
  // impersonate a specific known user id, but can no longer just declare
  // itself admin.
  const [current] = await db
    .select({ roleName: role.name })
    .from(userAccount)
    .innerJoin(role, eq(userAccount.roleId, role.id))
    .where(eq(userAccount.id, session.user.id));

  if (!current) {
    redirect("/login");
  }

  session.user.role = current.roleName;
  return session;
}
