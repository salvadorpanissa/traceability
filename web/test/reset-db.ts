import { sql } from "drizzle-orm";
import { testDb } from "./db";

export async function resetTestDb() {
  // Truncate in FK-safe order: children before parents
  await testDb.execute(sql`TRUNCATE TABLE user_farm CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE user_account RESTART IDENTITY CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE farm RESTART IDENTITY CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE role RESTART IDENTITY CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE category RESTART IDENTITY CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE product RESTART IDENTITY CASCADE`);
}
