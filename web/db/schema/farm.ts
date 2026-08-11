import { pgTable, uuid, text } from "drizzle-orm/pg-core";

// A group of establecimientos that share one catalog (categorías, productos)
// instead of each establecimiento keeping its own — e.g. one operator running
// Cuatro Cerros and San Antonio wants "Vaquillona" to be a single category,
// not two. An establecimiento belongs to exactly one farm (establishment.
// farm_id); which establecimientos share a farm is just that column, editable
// any time an establecimiento joins or leaves one.
export const farm = pgTable("farm", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
});
