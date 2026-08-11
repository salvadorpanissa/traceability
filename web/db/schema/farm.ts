import { pgTable, uuid, text } from "drizzle-orm/pg-core";
import { farmGroup } from "./farm-group";

export const farm = pgTable("farm", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => farmGroup.id),
  name: text("name").notNull(),
});
