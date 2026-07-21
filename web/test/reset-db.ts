import { sql } from "drizzle-orm";
import { testDb } from "./db";

export async function resetTestDb() {
  // Truncate in FK-safe order: children before parents
  await testDb.execute(sql`TRUNCATE TABLE event_transfer CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE event_health CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE event_retag CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE event_recategorize CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE event_sale CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE event_death CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE event CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE batch_operation CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE animal_tag_history CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE animal RESTART IDENTITY CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE user_farm CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE user_account RESTART IDENTITY CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE paddock CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE farm RESTART IDENTITY CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE role RESTART IDENTITY CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE category RESTART IDENTITY CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE product RESTART IDENTITY CASCADE`);
  await testDb.execute(sql`TRUNCATE TABLE column_mapping RESTART IDENTITY CASCADE`);
}
