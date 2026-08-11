import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { owner } from "./owner";
import { establishment } from "./establishment";

export const dicose = pgTable(
  "dicose",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owner.id),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishment.id),
    dicoseCode: text("dicose_code").notNull(),
  },
  (table) => [
    index("dicose_owner_id_idx").on(table.ownerId),
    index("dicose_establishment_id_idx").on(table.establishmentId),
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
    dicoseId: uuid("dicose_id")
      .notNull()
      .references(() => dicose.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("own_tag_dicose_id_idx").on(table.dicoseId)]
);
