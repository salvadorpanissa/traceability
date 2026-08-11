import { pgTable, uuid, text, unique } from "drizzle-orm/pg-core";
import { establishment } from "./establishment";

export const paddock = pgTable(
  "paddock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishment.id),
    name: text("name").notNull(),
  },
  (table) => [unique("paddock_establishment_id_name_unique").on(table.establishmentId, table.name)]
);
