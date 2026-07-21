import { pgTable, uuid, text } from "drizzle-orm/pg-core";
import { farm } from "./farm";

export const paddock = pgTable("paddock", {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id")
    .notNull()
    .references(() => farm.id),
  name: text("name").notNull(),
});
