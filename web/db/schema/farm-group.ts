import { pgTable, uuid, text } from "drizzle-orm/pg-core";

// A group of campos that share one catalog (categorías, productos) instead
// of each campo keeping its own — e.g. one operator running Cuatro Cerros and
// San Antonio wants "Vaquillona" to be a single category, not two. A campo
// belongs to exactly one grupo (farm.group_id); which campos share a grupo
// is just that column, editable any time a campo joins or leaves one.
export const farmGroup = pgTable("farm_group", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
});
