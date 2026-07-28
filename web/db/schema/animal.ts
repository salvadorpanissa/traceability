import { pgTable, uuid, text, date, timestamp, index, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";
import { owner } from "./owner";

export const animalSex = pgEnum("animal_sex", ["male", "female"]);

export const animal = pgTable(
  "animal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    birthDate: date("birth_date"),
    sex: animalSex("sex"),
    ownerId: uuid("owner_id").references(() => owner.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("animal_owner_id_idx").on(table.ownerId)]
);

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
  (table) => [
    index("animal_tag_history_animal_id_idx").on(table.animalId),
    // Every write path (batch-resolution.ts, own-tag.ts) already refuses to
    // attach a tag that appears anywhere in this table to a different
    // animal — a permanent one-tag-one-animal invariant. This makes that
    // invariant a real constraint instead of relying on a check-then-insert
    // race between concurrent imports to never happen.
    uniqueIndex("animal_tag_history_tag_idx").on(table.tag),
  ]
);
