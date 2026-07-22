import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { owner } from "./owner";
import { farm } from "./farm";
import { userAccount } from "./user";

export const dicoseRegistration = pgTable("dicose_registration", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => owner.id),
  farmId: uuid("farm_id")
    .notNull()
    .references(() => farm.id),
  dicoseCode: text("dicose_code").notNull(),
});

export const ownTag = pgTable("own_tag", {
  tag: text("tag").primaryKey(),
  dicoseRegistrationId: uuid("dicose_registration_id")
    .notNull()
    .references(() => dicoseRegistration.id),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => userAccount.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
