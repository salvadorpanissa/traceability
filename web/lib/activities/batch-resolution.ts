import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { animalTagHistory, category } from "@/db/schema";
import type { MappedRow } from "@/lib/activities/column-mapping";

export type ResolvedRow = { tag: string; eventDate: string } & (
  | { status: "existing"; animalId: string; currentFarmId: string | null; currentPaddockId: string | null }
  | { status: "new"; categoryId: string | null }
  | { status: "error"; reason: string }
);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function resolveEventDate(rowDate: string | null, formEventDate: string): string {
  return rowDate && ISO_DATE.test(rowDate) ? rowDate : formEventDate;
}

type CurrentStateRow = { current_farm_id: string | null; current_paddock_id: string | null; status: string };

export async function resolveBatchRows(rows: MappedRow[], formEventDate: string): Promise<ResolvedRow[]> {
  const tagCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.tag) continue;
    tagCounts.set(row.tag, (tagCounts.get(row.tag) ?? 0) + 1);
  }

  const nonEmptyTags = rows.map((r) => r.tag).filter((tag) => tag.length > 0);
  const tagHistoryRows =
    nonEmptyTags.length > 0
      ? await db
          .select({ tag: animalTagHistory.tag, animalId: animalTagHistory.animalId })
          .from(animalTagHistory)
          .where(inArray(animalTagHistory.tag, nonEmptyTags))
      : [];
  const animalIdByTag = new Map(tagHistoryRows.map((r) => [r.tag, r.animalId]));

  const categoryRows = await db.select({ id: category.id, name: category.name }).from(category);
  const categoryIdByName = new Map(categoryRows.map((c) => [c.name, c.id]));

  const result: ResolvedRow[] = [];
  for (const row of rows) {
    const eventDate = resolveEventDate(row.date, formEventDate);

    if (!row.tag) {
      result.push({ tag: row.tag, eventDate, status: "error", reason: "Falta la caravana" });
      continue;
    }
    if ((tagCounts.get(row.tag) ?? 0) > 1) {
      result.push({ tag: row.tag, eventDate, status: "error", reason: "Caravana duplicada en el archivo" });
      continue;
    }

    const animalId = animalIdByTag.get(row.tag);
    if (animalId) {
      const stateResult = await db.execute<CurrentStateRow>(
        sql`select current_farm_id, current_paddock_id, status from animal_current_state where animal_id = ${animalId}`
      );
      const state = stateResult.rows[0];
      if (state && state.status !== "alive") {
        result.push({ tag: row.tag, eventDate, status: "error", reason: "El animal está vendido o muerto" });
        continue;
      }
      result.push({
        tag: row.tag,
        eventDate,
        status: "existing",
        animalId,
        currentFarmId: state?.current_farm_id ?? null,
        currentPaddockId: state?.current_paddock_id ?? null,
      });
      continue;
    }

    if (row.category) {
      const categoryId = categoryIdByName.get(row.category);
      if (!categoryId) {
        result.push({ tag: row.tag, eventDate, status: "error", reason: "Categoría no reconocida" });
        continue;
      }
      result.push({ tag: row.tag, eventDate, status: "new", categoryId });
      continue;
    }

    result.push({ tag: row.tag, eventDate, status: "new", categoryId: null });
  }

  return result;
}
