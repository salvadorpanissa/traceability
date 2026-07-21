import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const columnMapping = pgTable("column_mapping", {
  id: uuid("id").primaryKey().defaultRandom(),
  headerSignature: text("header_signature").notNull().unique(),
  mapping: jsonb("mapping").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
