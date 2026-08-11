import { pgTable, uuid, text, integer, unique } from "drizzle-orm/pg-core";
import { farm } from "./farm";

export const product = pgTable(
  "product",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farm.id),
    name: text("name").notNull(),
    defaultDose: text("default_dose"),
    defaultDoseUnit: text("default_dose_unit"),
    defaultRoute: text("default_route"),
    defaultWithdrawalDays: integer("default_withdrawal_days"),
  },
  (table) => [unique("product_farm_id_name_unique").on(table.farmId, table.name)]
);
