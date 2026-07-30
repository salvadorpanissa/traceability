import { pgTable, uuid, text, integer, boolean } from "drizzle-orm/pg-core";
import { animalSex } from "./animal";

export const category = pgTable("category", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  sex: animalSex("sex"),
  minAgeMonths: integer("min_age_months"),
  // Archived instead of hard-deleted: event_recategorize.old/new_category_id
  // reference this row with no ON DELETE clause, so any category that was
  // ever assigned to an animal can never actually be removed without
  // breaking that historical trail. "Deleting" a category really means
  // moving its current animals elsewhere and hiding it from future pickers.
  active: boolean("active").notNull().default(true),
});
