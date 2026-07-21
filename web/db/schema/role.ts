import { pgTable, uuid, text } from "drizzle-orm/pg-core";

export const role = pgTable("role", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
});
