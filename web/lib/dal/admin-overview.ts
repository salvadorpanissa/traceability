import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { farm, establishment, userAccount, userFarm, role } from "@/db/schema";

export type FarmOverviewEntry = {
  id: string;
  name: string;
  establishmentCount: number;
  managerCount: number;
};

// Counts only — never the manager names/emails themselves. The admin
// overview intentionally stays at "how many", not "who", per the request to
// keep user info out of the admin's direct view.
export async function listFarmsWithCounts(): Promise<FarmOverviewEntry[]> {
  const rows = await db
    .select({
      id: farm.id,
      name: farm.name,
      establishmentCount: sql<number>`count(distinct ${establishment.id})`,
      managerCount: sql<number>`count(distinct ${userFarm.userId})`,
    })
    .from(farm)
    .leftJoin(establishment, eq(establishment.farmId, farm.id))
    .leftJoin(userFarm, eq(userFarm.farmId, farm.id))
    .groupBy(farm.id)
    .orderBy(farm.name);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    establishmentCount: Number(r.establishmentCount),
    managerCount: Number(r.managerCount),
  }));
}

export type ManagerCandidate = { id: string; name: string; email: string };

// Scoped to just the fields needed to pick a manager in the "new farm"
// dialog, not a general-purpose user listing.
export async function listManagerCandidates(): Promise<ManagerCandidate[]> {
  return db
    .select({ id: userAccount.id, name: userAccount.name, email: userAccount.email })
    .from(userAccount)
    .innerJoin(role, eq(userAccount.roleId, role.id))
    .where(eq(role.name, "manager"))
    .orderBy(userAccount.name);
}

export async function createFarm(input: { name: string; managerId: string | null }): Promise<FarmOverviewEntry> {
  const [created] = await db.insert(farm).values({ name: input.name }).returning();
  if (input.managerId) {
    await db.insert(userFarm).values({ userId: input.managerId, farmId: created.id });
  }
  return { id: created.id, name: created.name, establishmentCount: 0, managerCount: input.managerId ? 1 : 0 };
}
