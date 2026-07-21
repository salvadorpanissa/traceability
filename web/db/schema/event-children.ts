import { pgTable, uuid, text, numeric, integer } from "drizzle-orm/pg-core";
import { event } from "./event";
import { farm } from "./farm";
import { product } from "./product";
import { category } from "./category";

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
});

export const eventRetag = pgTable("event_retag", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  oldTag: text("old_tag").notNull(),
  newTag: text("new_tag").notNull(),
});

export const eventRecategorize = pgTable("event_recategorize", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  oldCategoryId: uuid("old_category_id")
    .notNull()
    .references(() => category.id),
  newCategoryId: uuid("new_category_id")
    .notNull()
    .references(() => category.id),
});

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
