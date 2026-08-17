import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { columnHeaderMeaning } from "@/db/schema";
import type { ColumnMapping } from "@/lib/activities/column-mapping";

// Pre-fills a mapping step from each header's individually remembered
// meaning (e.g. "IDE" -> tag), independent of which other headers it shows
// up alongside this time — unlike matching the exact header signature of a
// whole file, this still recognizes a header mixed into a new combination.
// Null when nothing here is recognized yet (a blank ColumnMapper).
export async function rememberedInitialMapping(headers: string[]): Promise<ColumnMapping[] | null> {
  if (headers.length === 0) return null;
  const remembered = await db.select().from(columnHeaderMeaning).where(inArray(columnHeaderMeaning.header, headers));
  if (remembered.length === 0) return null;
  const meaningByHeader = new Map(remembered.map((r) => [r.header, r.meaning as ColumnMapping["meaning"]]));
  return headers.map((h) => ({ header: h, meaning: meaningByHeader.get(h) ?? "ignore" }));
}

// Called once a mapping is confirmed, so the next file — for this or any
// other activity — gets these same headers pre-filled.
export async function rememberColumnMeanings(mapping: ColumnMapping[]): Promise<void> {
  await Promise.all(
    mapping.map((m) =>
      db
        .insert(columnHeaderMeaning)
        .values({ header: m.header, meaning: m.meaning })
        .onConflictDoUpdate({ target: columnHeaderMeaning.header, set: { meaning: m.meaning, updatedAt: new Date() } })
    )
  );
}
