import { pgTable, uuid, text, numeric, integer, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { event } from "./event";
import { farm } from "./farm";
import { product } from "./product";
import { category } from "./category";
import { paddock } from "./paddock";

export const eventTransfer = pgTable("event_transfer", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  originFarmId: uuid("origin_farm_id")
    .notNull()
    .references(() => farm.id),
  destinationFarmId: uuid("destination_farm_id")
    .notNull()
    .references(() => farm.id),
  guideNumber: text("guide_number"),
  originPaddockId: uuid("origin_paddock_id").references(() => paddock.id),
  destinationPaddockId: uuid("destination_paddock_id").references(() => paddock.id),
});

export const eventHealth = pgTable("event_health", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => product.id),
  dose: numeric("dose").notNull(),
  doseUnit: text("dose_unit").notNull(),
  route: text("route").notNull(),
  withdrawalDays: integer("withdrawal_days"),
  notes: text("notes"),
  paddockId: uuid("paddock_id").references(() => paddock.id),
});

export const eventRetag = pgTable("event_retag", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  oldTag: text("old_tag").notNull(),
  newTag: text("new_tag").notNull(),
});

export const eventRecategorize = pgTable(
  "event_recategorize",
  {
    eventId: uuid("event_id")
      .primaryKey()
      .references(() => event.id, { onDelete: "cascade" }),
    oldCategoryId: uuid("old_category_id")
      .notNull()
      .references(() => category.id),
    newCategoryId: uuid("new_category_id")
      .notNull()
      .references(() => category.id),
    // 'initial' = first-time assignment on animal creation/import (existing
    // code paths, unchanged). 'manual' = a human explicitly changed it (no
    // code path writes this yet — reserved for a future manual-recategorize
    // feature). 'auto_age' = written by the scheduled age-based job (Task 4).
    // The job only ever acts on an animal whose current category has
    // minAgeMonths set AND whose latest recategorize event's source isn't
    // 'manual' — this column is what lets a human override stick.
    source: text("source").notNull().default("initial"),
  },
  (table) => [check("event_recategorize_source_check", sql`${table.source} in ('initial', 'manual', 'auto_age')`)]
);

export const eventSale = pgTable("event_sale", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  buyer: text("buyer"),
  price: numeric("price"),
  weightKg: numeric("weight_kg"),
});

export const eventDeath = pgTable("event_death", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  cause: text("cause"),
});
