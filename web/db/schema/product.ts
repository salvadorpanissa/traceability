import { pgTable, uuid, text, integer, unique } from "drizzle-orm/pg-core";
import { farmGroup } from "./farm-group";

export const product = pgTable(
  "product",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => farmGroup.id),
    name: text("name").notNull(),
    defaultDose: text("default_dose"),
    defaultDoseUnit: text("default_dose_unit"),
    defaultRoute: text("default_route"),
    defaultWithdrawalDays: integer("default_withdrawal_days"),
  },
  (table) => [unique("product_group_id_name_unique").on(table.groupId, table.name)]
);
