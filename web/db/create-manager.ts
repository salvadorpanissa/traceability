import { config } from "dotenv";
import path from "node:path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createDbClient } from "./client";
import { role, farm, userAccount, userFarm } from "./schema";

// Usage: FARM_ID=... MANAGER_EMAIL=... MANAGER_NAME=... MANAGER_PASSWORD=... \
//   ENV_FILE=.env.production tsx db/create-manager.ts
config({ path: path.resolve(__dirname, "..", process.env.ENV_FILE ?? ".env.local"), quiet: true });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const farmId = process.env.FARM_ID;
  const email = process.env.MANAGER_EMAIL;
  const name = process.env.MANAGER_NAME;
  const password = process.env.MANAGER_PASSWORD;
  if (!farmId || !email || !name || !password) {
    throw new Error("FARM_ID, MANAGER_EMAIL, MANAGER_NAME and MANAGER_PASSWORD are all required");
  }

  const db = createDbClient(connectionString);

  const [existingFarm] = await db.select().from(farm).where(eq(farm.id, farmId));
  if (!existingFarm) throw new Error(`No farm found with id ${farmId}`);

  const [existingUser] = await db.select().from(userAccount).where(eq(userAccount.email, email));
  if (existingUser) throw new Error(`A user with email ${email} already exists`);

  let [managerRole] = await db.select().from(role).where(eq(role.name, "manager"));
  if (!managerRole) [managerRole] = await db.insert(role).values({ name: "manager" }).returning();

  const passwordHash = await bcrypt.hash(password, 10);
  const [manager] = await db.insert(userAccount).values({ name, email, passwordHash, roleId: managerRole.id }).returning();

  await db.insert(userFarm).values({ userId: manager.id, farmId: existingFarm.id });

  console.log(`Created manager ${name} <${email}> and assigned to farm "${existingFarm.name}" (${existingFarm.id})`);
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
