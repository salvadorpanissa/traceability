import { pgTable, uuid, text, integer } from "drizzle-orm/pg-core";

export const product = pgTable("product", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  defaultDoseUnit: text("default_dose_unit"),
  defaultWithdrawalDays: integer("default_withdrawal_days"),
});
