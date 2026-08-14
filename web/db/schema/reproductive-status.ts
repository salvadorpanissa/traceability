import { pgTable, uuid, text, boolean, unique } from "drizzle-orm/pg-core";
import { farm } from "./farm";

// Farm-scoped, igual que category — a diferencia de category, no es
// event-sourced (ningún evento referencia esta tabla), así que archivar una
// entrada es un simple flag sin necesidad de reasignar animales.
export const reproductiveStatus = pgTable(
  "reproductive_status",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farm.id),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [unique("reproductive_status_farm_id_name_unique").on(table.farmId, table.name)]
);
