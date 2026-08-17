import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

// Remembers what a single Excel column header means (e.g. "IDE" -> tag),
// independent of which other columns happen to sit next to it — unlike
// column_mapping (keyed by the exact set+order of headers in one file),
// this lets a header get pre-filled even when it shows up in a new
// combination.
export const columnHeaderMeaning = pgTable("column_header_meaning", {
  id: uuid("id").primaryKey().defaultRandom(),
  header: text("header").notNull().unique(),
  meaning: text("meaning").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
