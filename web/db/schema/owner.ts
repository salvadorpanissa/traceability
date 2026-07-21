import { pgTable, uuid, text } from "drizzle-orm/pg-core";

export const owner = pgTable("owner", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
});
