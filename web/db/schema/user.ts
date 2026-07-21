import { pgTable, uuid, text, primaryKey } from "drizzle-orm/pg-core";
import { role } from "./role";
import { farm } from "./farm";

export const userAccount = pgTable("user_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => role.id),
});

export const userFarm = pgTable(
  "user_farm",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.farmId] }),
  })
);
