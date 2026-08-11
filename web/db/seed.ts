import { config } from "dotenv";
import path from "node:path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createDbClient } from "./client";
import { role, establishment, farm, userAccount } from "./schema";

// ENV_FILE picks which env file to load (.env.local for local dev by
// default, .env.production for prod) — same mechanism as db/migrate.ts.
config({ path: path.resolve(__dirname, "..", process.env.ENV_FILE ?? ".env.local"), quiet: true });

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

  console.log(
    `Seeded: admin (${adminEmail}), establishments ${seededEstablishments.map((e) => `"${e.name}"`).join(", ")}`
  );
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
