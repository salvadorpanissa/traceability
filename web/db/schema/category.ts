import { pgTable, uuid, text, integer } from "drizzle-orm/pg-core";
import { animalSex } from "./animal";

export const category = pgTable("category", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  sex: animalSex("sex"),
  minAgeMonths: integer("min_age_months"),
});
