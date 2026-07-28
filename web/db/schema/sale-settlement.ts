import { pgTable, uuid, text, numeric, date, timestamp, index } from "drizzle-orm/pg-core";
import { batchOperation } from "./event";
import { userAccount } from "./user";
import { bytea } from "./custom-types";

export const saleSettlement = pgTable(
  "sale_settlement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchOperationId: uuid("batch_operation_id")
      .notNull()
      .references(() => batchOperation.id),
    guideNumber: text("guide_number").notNull(),
    frigorifico: text("frigorifico").notNull(),
    weighDate: date("weigh_date").notNull(),
    totalAmount: numeric("total_amount").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileData: bytea("file_data").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => userAccount.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sale_settlement_batch_operation_id_idx").on(table.batchOperationId),
    index("sale_settlement_created_by_idx").on(table.createdBy),
  ]
);
