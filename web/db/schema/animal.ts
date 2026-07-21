import { pgTable, uuid, text, date, timestamp, index, pgEnum } from "drizzle-orm/pg-core";
import { owner } from "./owner";

export const animalSex = pgEnum("animal_sex", ["male", "female"]);

export const animal = pgTable("animal", {
  id: uuid("id").primaryKey().defaultRandom(),
  birthDate: date("birth_date"),
  sex: animalSex("sex"),
  ownerId: uuid("owner_id").references(() => owner.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const animalTagHistory = pgTable(
  "animal_tag_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    animalId: uuid("animal_id")
      .notNull()
      .references(() => animal.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("animal_tag_history_animal_id_idx").on(table.animalId), index("animal_tag_history_tag_idx").on(table.tag)]
);
