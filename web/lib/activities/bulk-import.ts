import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { animalTagHistory, farm } from "@/db/schema";
import type { MappedImportRow } from "@/lib/activities/bulk-import-mapping";
import { normalizeSex } from "@/lib/activities/sex-normalization";
import { normalizeDate } from "@/lib/activities/date-normalization";

export type ResolvedImportRow =
  | {
      status: "valid";
      tag: string;
      secondaryTag: string | null;
      ownerName: string | null;
      farmId: string;
      paddockName: string | null;
      categoryName: string | null;
      breed: string | null;
      sex: "male" | "female" | null;
      birthDate: string | null;
      eventDate: string;
    }
  | { status: "error"; tag: string; reason: string };

export async function resolveImportRows(rows: MappedImportRow[]): Promise<ResolvedImportRow[]> {
  const tagCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.tag) continue;
    tagCounts.set(row.tag, (tagCounts.get(row.tag) ?? 0) + 1);
  }

  const nonEmptyTags = rows.map((r) => r.tag).filter((tag) => tag.length > 0);
  const existingTagRows =
    nonEmptyTags.length > 0
      ? await db.select({ tag: animalTagHistory.tag }).from(animalTagHistory).where(inArray(animalTagHistory.tag, nonEmptyTags))
      : [];
  const existingTags = new Set(existingTagRows.map((r) => r.tag));

  const farmRows = await db.select({ id: farm.id, name: farm.name }).from(farm);
  const farmIdByName = new Map(farmRows.map((f) => [f.name.trim(), f.id]));

  const result: ResolvedImportRow[] = [];
  for (const row of rows) {
    if (!row.tag) {
      result.push({ status: "error", tag: row.tag, reason: "Falta la caravana" });
      continue;
    }
    if ((tagCounts.get(row.tag) ?? 0) > 1) {
      result.push({ status: "error", tag: row.tag, reason: "Caravana duplicada en el archivo" });
      continue;
    }
    if (existingTags.has(row.tag)) {
      result.push({ status: "error", tag: row.tag, reason: "La caravana ya existe en el sistema" });
      continue;
    }

    const farmName = row.farmName?.trim();
    const farmId = farmName ? farmIdByName.get(farmName) : undefined;
    if (!farmId) {
      result.push({ status: "error", tag: row.tag, reason: "Estancia no reconocida" });
      continue;
    }

    const eventDate = row.eventDate ? normalizeDate(row.eventDate) : null;
    if (!eventDate) {
      result.push({ status: "error", tag: row.tag, reason: "Falta fecha de alta" });
      continue;
    }

    result.push({
      status: "valid",
      tag: row.tag,
      secondaryTag: row.secondaryTag,
      ownerName: row.ownerName,
      farmId,
      paddockName: row.paddockName,
      categoryName: row.categoryName,
      breed: row.breed,
      sex: normalizeSex(row.sex),
      birthDate: row.birthDate ? normalizeDate(row.birthDate) : null,
      eventDate,
    });
  }

  return result;
}
