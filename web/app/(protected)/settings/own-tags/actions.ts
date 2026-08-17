"use server";

import { requireSession } from "@/lib/dal/session";
import { requireEstablishmentAccess, getEstablishmentFarmId } from "@/lib/dal/farm-access";
import { requireFile } from "@/lib/dal/form-data";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import {
  computeHeaderSignature,
  applyOwnTagColumnMapping,
  ownTagMappingHasPaddock,
  type ColumnMapping,
  type MappedOwnTagRow,
} from "@/lib/activities/column-mapping";
import {
  importOwnTags,
  countOwnTagsByRegistration,
  countAliveAnimalsByOwnerEstablishment,
  countBareOwnTagsByRegistration,
  findMissingPaddockNames,
  findMissingCategoryNames,
  type OwnTagImportResult,
} from "@/lib/dal/own-tag";
import {
  listDicoseRegistrations,
  getDicoseRegistrationEstablishmentId,
  type DicoseEntry,
} from "@/lib/dal/dicose";
import { createPaddock, type PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";
import { createCategory, type CategoryCatalogEntry } from "@/lib/dal/category-catalog";
import { rememberedInitialMapping, rememberColumnMeanings } from "@/lib/dal/column-header-meaning";

export type OwnTagPreviewResult =
  | { mappingNeeded: true; headers: string[]; initialMapping: ColumnMapping[] | null }
  | {
      mappingNeeded: false;
      headerSignature: string;
      mapping: ColumnMapping[];
      rows: MappedOwnTagRow[];
      pendingPaddockNames: string[];
      pendingCategoryNames: string[];
    };

// Opaque identifier round-tripped through the preview/confirm flow — no
// longer used to look up a cached mapping (see column-header-meaning.ts),
// which remembers each header's meaning individually across activities.
function ownTagHeaderSignature(headers: string[]): string {
  return computeHeaderSignature(["__own_tag__", ...headers]);
}

async function requireDicoseRegistrationAccess(
  session: { user: { id: string; role?: string } },
  dicoseId: string
): Promise<void> {
  const establishmentId = await getDicoseRegistrationEstablishmentId(dicoseId);
  if (!establishmentId) throw new Error("Registro DICOSE no encontrado");
  await requireEstablishmentAccess(session.user.id, session.user.role, establishmentId);
}

export async function previewOwnTagUpload(dicoseId: string, formData: FormData): Promise<OwnTagPreviewResult> {
  const session = await requireSession();
  await requireDicoseRegistrationAccess(session, dicoseId);

  const file = requireFile(formData, "file");
  const mappingOverride = formData.get("mapping") as string | null;

  const buffer = await file.arrayBuffer();
  const { headers, rows } = await parseExcelFile(buffer);
  const headerSignature = ownTagHeaderSignature(headers);

  let mapping: ColumnMapping[];
  if (mappingOverride) {
    mapping = JSON.parse(mappingOverride) as ColumnMapping[];
  } else {
    return { mappingNeeded: true, headers, initialMapping: await rememberedInitialMapping(headers) };
  }

  const mappedRows = applyOwnTagColumnMapping(headers, rows, mapping);

  let pendingPaddockNames: string[] = [];
  if (ownTagMappingHasPaddock(mapping)) {
    const paddockNames = mappedRows.map((r) => r.paddock).filter((n): n is string => !!n);
    pendingPaddockNames = await findMissingPaddockNames(dicoseId, paddockNames);
  }

  let pendingCategoryNames: string[] = [];
  if (mapping.some((m) => m.meaning === "category")) {
    const categoryNames = mappedRows.map((r) => r.category).filter((n): n is string => !!n);
    pendingCategoryNames = await findMissingCategoryNames(dicoseId, categoryNames);
  }

  return { mappingNeeded: false, headerSignature, mapping, rows: mappedRows, pendingPaddockNames, pendingCategoryNames };
}

export async function createOwnTagPaddockAction(establishmentId: string, name: string): Promise<PaddockCatalogEntry> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, establishmentId);
  return createPaddock(establishmentId, name);
}

export async function createOwnTagCategoryAction(establishmentId: string, name: string): Promise<CategoryCatalogEntry> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, establishmentId);
  const farmId = await getEstablishmentFarmId(establishmentId);
  if (!farmId) throw new Error("Campo no encontrado");
  return createCategory(farmId, { name });
}

export async function confirmOwnTagUpload(
  dicoseId: string,
  headerSignature: string,
  mapping: ColumnMapping[],
  rows: MappedOwnTagRow[]
): Promise<OwnTagImportResult> {
  const session = await requireSession();
  await requireDicoseRegistrationAccess(session, dicoseId);

  await rememberColumnMeanings(mapping);

  return importOwnTags(dicoseId, session.user.id, rows);
}

export async function listOwnTagCounts(): Promise<
  { registration: DicoseEntry; count: number; lastUploadedAt: string | null }[]
> {
  const session = await requireSession();
  const [registrations, animalCounts, bareCounts, uploads] = await Promise.all([
    listDicoseRegistrations(session.user.id, session.user.role),
    countAliveAnimalsByOwnerEstablishment(),
    countBareOwnTagsByRegistration(),
    countOwnTagsByRegistration(),
  ]);
  const animalCountByOwnerEstablishment = new Map(animalCounts.map((c) => [`${c.ownerId}:${c.establishmentId}`, c.count]));
  const bareCountByRegistrationId = new Map(bareCounts.map((c) => [c.dicoseId, c.count]));
  const lastUploadedAtByRegistrationId = new Map(uploads.map((u) => [u.dicoseId, u.lastUploadedAt]));
  return registrations.map((registration) => ({
    registration,
    count:
      (animalCountByOwnerEstablishment.get(`${registration.ownerId}:${registration.establishmentId}`) ?? 0) +
      (bareCountByRegistrationId.get(registration.id) ?? 0),
    lastUploadedAt: lastUploadedAtByRegistrationId.get(registration.id)?.toISOString() ?? null,
  }));
}
