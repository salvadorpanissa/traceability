import { pgTable, uuid, text, integer, jsonb, timestamp, date, index, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { establishment } from "./establishment";
import { userAccount } from "./user";
import { animal } from "./animal";
import { bytea } from "./custom-types";

export const batchOperation = pgTable(
  "batch_operation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishment.id),
    selectionCriteria: jsonb("selection_criteria").notNull().default({}),
    animalCount: integer("animal_count").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    guideFileName: text("guide_file_name"),
    guideMimeType: text("guide_mime_type"),
    guideFileData: bytea("guide_file_data"),
  },
  (table) => [
    index("batch_operation_establishment_id_idx").on(table.establishmentId),
    index("batch_operation_created_by_idx").on(table.createdBy),
  ]
);

export const event = pgTable(
  "event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    eventDate: date("event_date").notNull(),
    animalId: uuid("animal_id")
      .notNull()
      .references(() => animal.id),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishment.id),
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
    index("event_establishment_id_idx").on(table.establishmentId),
    index("event_event_date_idx").on(table.eventDate),
    check(
      "event_type_check",
      sql`${table.eventType} in ('transfer', 'health', 'retag', 'recategorize', 'sale', 'death', 'pesaje', 'void')`
    ),
    check(
      "event_voids_only_when_void",
      sql`(${table.eventType} = 'void' and ${table.voidsEventId} is not null) or (${table.eventType} <> 'void' and ${table.voidsEventId} is null)`
    ),
  ]
);
