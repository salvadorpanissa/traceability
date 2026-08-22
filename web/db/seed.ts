import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createDbClient } from "./client";
import { role, establishment, farm, userAccount, userFarm } from "./schema";
import { loadEnv } from "./env";

loadEnv();

async function upsertRole(db: ReturnType<typeof createDbClient>, name: string) {
  const [existing] = await db.select().from(role).where(eq(role.name, name));
  if (existing) return existing;
  const [created] = await db.insert(role).values({ name }).returning();
  return created;
}

async function run() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set");
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const db = createDbClient(connectionString);

  const adminRole = await upsertRole(db, "admin");
  await upsertRole(db, "manager");

  const farmName = "Campos";
  const [existingFarm] = await db.select().from(farm).where(eq(farm.name, farmName));
  const seededFarm = existingFarm ?? (await db.insert(farm).values({ name: farmName }).returning())[0];

  const establishmentNames = ["San Antonio", "Cuatro Cerros"];
  const seededEstablishments = [];
  for (const name of establishmentNames) {
    const [existingEstablishment] = await db.select().from(establishment).where(eq(establishment.name, name));
    seededEstablishments.push(
      existingEstablishment ?? (await db.insert(establishment).values({ name, farmId: seededFarm.id }).returning())[0]
    );
  }

  const [existingAdmin] = await db.select().from(userAccount).where(eq(userAccount.email, adminEmail));
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await db.insert(userAccount).values({
      name: "Admin",
      email: adminEmail,
      passwordHash,
      roleId: adminRole.id,
    });
  }

  // Manager for "Campos" — assigned at the farm level, so it covers every
  // establecimiento under it (San Antonio, Cuatro Cerros), same as
  // seed-demo.ts.
  const managerRole = await upsertRole(db, "manager");
  const managerEmail = "panissa@manager.com";
  const [existingManager] = await db.select().from(userAccount).where(eq(userAccount.email, managerEmail));
  if (!existingManager) {
    const managerPasswordHash = await bcrypt.hash("Artigas1146", 10);
    const [manager] = await db
      .insert(userAccount)
      .values({ name: "Panissa", email: managerEmail, passwordHash: managerPasswordHash, roleId: managerRole.id })
      .returning();
    await db.insert(userFarm).values({ userId: manager.id, farmId: seededFarm.id });
  }

  console.log(
    `Seeded: admin (${adminEmail}), manager (${managerEmail}), establishments ${seededEstablishments.map((e) => `"${e.name}"`).join(", ")}`
  );
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
