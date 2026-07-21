import { pgTable, uuid, text, unique } from "drizzle-orm/pg-core";
import { farm } from "./farm";

export const paddock = pgTable(
  "paddock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farm.id),
    name: text("name").notNull(),
  },
  (table) => [unique("paddock_farm_id_name_unique").on(table.farmId, table.name)]
);
