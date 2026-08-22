import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { animalTagHistory } from "@/db/schema";
import { normalizeDate } from "@/lib/activities/date-normalization";
import type { PesajeMappedRow } from "@/lib/activities/column-mapping";

export type PesajeResolvedRow =
  | {
      tag: string;
      eventDate: string;
      notes: string | null;
      status: "existing";
      animalId: string;
      currentEstablishmentId: string;
      // null in "tropa" mode (no per-animal weight in the file) until
      // confirmPesajeBatch fills it in from the truck's total weight.
      weightKg: string | null;
    }
  | {
      tag: string;
      eventDate: string;
      notes: string | null;
      status: "error";
      reason: string;
    };

function resolveEventDate(rowDate: string | null, formEventDate: string | null): string | null {
  if (rowDate) {
    const normalized = normalizeDate(rowDate);
    if (normalized) return normalized;
  }
  return formEventDate;
}

// Accepts "420", "420.5" or "420,5" (comma decimal, common in local Excel
// exports); anything else, or a non-positive value, is not a real weight.
function parseWeightKg(raw: string | null): string | null {
  if (!raw) return null;
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized) > 0 ? normalized : null;
}

type CurrentStateRow = { current_establishment_id: string | null; current_farm_id: string | null; status: string };

export async function resolvePesajeBatchRows(
  rows: PesajeMappedRow[],
  formEventDate: string | null,
  farmId: string,
  options?: { requireWeight?: boolean }
): Promise<PesajeResolvedRow[]> {
  const requireWeight = options?.requireWeight ?? true;
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

  const result: PesajeResolvedRow[] = [];
  for (const row of rows) {
    const eventDate = resolveEventDate(row.date, formEventDate);
    const notes = row.notes;

    if (!eventDate) {
      result.push({ tag: row.tag, eventDate: "", notes, status: "error", reason: "Falta la fecha" });
      continue;
    }
    if (!row.tag) {
      result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "Falta la caravana" });
      continue;
    }
    if ((tagCounts.get(row.tag) ?? 0) > 1) {
      result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "Caravana duplicada en el archivo" });
      continue;
    }

    let weightKg: string | null = null;
    if (requireWeight) {
      weightKg = parseWeightKg(row.weight ?? null);
      if (!weightKg) {
        result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "Falta el peso o no es válido" });
        continue;
      }
    }

    const animalId = animalIdByTag.get(row.tag);
    if (!animalId) {
      result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "Caravana no encontrada" });
      continue;
    }

    const stateResult = await db.execute<CurrentStateRow>(sql`
      select acs.current_establishment_id, e.farm_id as current_farm_id, acs.status
      from animal_current_state acs
      left join establishment e on e.id = acs.current_establishment_id
      where acs.animal_id = ${animalId}
    `);
    const state = stateResult.rows[0];

    if (!state || state.status !== "alive") {
      result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "El animal está vendido o muerto" });
      continue;
    }
    if (!state.current_establishment_id || state.current_farm_id !== farmId) {
      result.push({ tag: row.tag, eventDate, notes, status: "error", reason: "El animal no pertenece a este grupo de campos" });
      continue;
    }

    result.push({
      tag: row.tag,
      eventDate,
      notes,
      status: "existing",
      animalId,
      currentEstablishmentId: state.current_establishment_id,
      weightKg,
    });
  }

  return result;
}
