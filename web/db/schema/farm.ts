import { pgTable, uuid, text } from "drizzle-orm/pg-core";

export const farm = pgTable("farm", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  dicoseCode: text("dicose_code"),
  ruc: text("ruc"),
});
