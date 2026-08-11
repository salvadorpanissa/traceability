import { pgTable, uuid, text, integer, boolean, unique } from "drizzle-orm/pg-core";
import { animalSex } from "./animal";
import { farm } from "./farm";

export const category = pgTable(
  "category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farm.id),
    name: text("name").notNull(),
    sex: animalSex("sex"),
    minAgeMonths: integer("min_age_months"),
    // Archived instead of hard-deleted: event_recategorize.old/new_category_id
    // reference this row with no ON DELETE clause, so any category that was
    // ever assigned to an animal can never actually be removed without
    // breaking that historical trail. "Deleting" a category really means
    // moving its current animals elsewhere and hiding it from future pickers.
    active: boolean("active").notNull().default(true),
  },
  (table) => [unique("category_farm_id_name_unique").on(table.farmId, table.name)]
);
