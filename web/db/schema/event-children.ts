import { pgTable, uuid, text, numeric, integer, boolean, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { event } from "./event";
import { establishment } from "./establishment";
import { product } from "./product";
import { category } from "./category";
import { paddock } from "./paddock";

export const eventTransfer = pgTable(
  "event_transfer",
  {
    eventId: uuid("event_id")
      .primaryKey()
      .references(() => event.id, { onDelete: "cascade" }),
    originEstablishmentId: uuid("origin_establishment_id")
      .notNull()
      .references(() => establishment.id),
    destinationEstablishmentId: uuid("destination_establishment_id")
      .notNull()
      .references(() => establishment.id),
    guideNumber: text("guide_number"),
    originPaddockId: uuid("origin_paddock_id").references(() => paddock.id),
    destinationPaddockId: uuid("destination_paddock_id").references(() => paddock.id),
  },
  (table) => [
    index("event_transfer_origin_establishment_id_idx").on(table.originEstablishmentId),
    index("event_transfer_destination_establishment_id_idx").on(table.destinationEstablishmentId),
    index("event_transfer_origin_paddock_id_idx").on(table.originPaddockId),
    index("event_transfer_destination_paddock_id_idx").on(table.destinationPaddockId),
  ]
);

export const eventHealth = pgTable(
  "event_health",
  {
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
  },
  (table) => [
    index("event_health_product_id_idx").on(table.productId),
    index("event_health_paddock_id_idx").on(table.paddockId),
  ]
);

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
  (table) => [
    check("event_recategorize_source_check", sql`${table.source} in ('initial', 'manual', 'auto_age')`),
    index("event_recategorize_old_category_id_idx").on(table.oldCategoryId),
    index("event_recategorize_new_category_id_idx").on(table.newCategoryId),
  ]
);

export const eventSale = pgTable("event_sale", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  buyer: text("buyer"),
  price: numeric("price"),
  weightKg: numeric("weight_kg"),
  guideNumber: text("guide_number"),
});

export const eventDeath = pgTable("event_death", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  cause: text("cause"),
});

export const eventPesaje = pgTable("event_pesaje", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  weightKg: numeric("weight_kg").notNull(),
  // true when weightKg is total-weighed-truckload / head-count (no scale on
  // the establecimiento) rather than an individual reading — lets reports
  // and the per-animal weight history flag it as approximate.
  estimated: boolean("estimated").notNull().default(false),
});
