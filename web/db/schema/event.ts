import { pgTable, uuid, text, integer, jsonb, timestamp, date, index, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { farm } from "./farm";
import { userAccount } from "./user";
import { animal } from "./animal";

export const batchOperation = pgTable("batch_operation", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),
  farmId: uuid("farm_id")
    .notNull()
    .references(() => farm.id),
  selectionCriteria: jsonb("selection_criteria").notNull().default({}),
  animalCount: integer("animal_count").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => userAccount.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const event = pgTable(
  "event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    eventDate: date("event_date").notNull(),
    animalId: uuid("animal_id")
      .notNull()
      .references(() => animal.id),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farm.id),
    batchOperationId: uuid("batch_operation_id")
      .notNull()
      .references(() => batchOperation.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    voidsEventId: uuid("voids_event_id").references((): AnyPgColumn => event.id),
    notes: text("notes"),
  },
  (table) => [
    index("event_animal_id_idx").on(table.animalId),
    index("event_batch_operation_id_idx").on(table.batchOperationId),
    check(
      "event_type_check",
      sql`${table.eventType} in ('transfer', 'health', 'retag', 'recategorize', 'sale', 'death', 'void')`
    ),
    check(
      "event_voids_only_when_void",
      sql`(${table.eventType} = 'void' and ${table.voidsEventId} is not null) or (${table.eventType} <> 'void' and ${table.voidsEventId} is null)`
    ),
  ]
);
