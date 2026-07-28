import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { owner } from "./owner";
import { farm } from "./farm";

export const dicoseRegistration = pgTable(
  "dicose_registration",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owner.id),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farm.id),
    dicoseCode: text("dicose_code").notNull(),
  },
  (table) => [
    index("dicose_registration_owner_id_idx").on(table.ownerId),
    index("dicose_registration_farm_id_idx").on(table.farmId),
  ]
);

// own_tag is purely a "this tag belongs to us" registry — a tag can exist
// here with no animal yet (pre-registered/reserved) or already linked to one
// (via animal_tag_history). Biographical data (sex/category/birth date)
// lives only on animal, never staged here, to avoid two copies of the same
// fact going stale relative to each other.
export const ownTag = pgTable(
  "own_tag",
  {
    tag: text("tag").primaryKey(),
    dicoseRegistrationId: uuid("dicose_registration_id")
      .notNull()
      .references(() => dicoseRegistration.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("own_tag_dicose_registration_id_idx").on(table.dicoseRegistrationId)]
);
