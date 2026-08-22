"use server";

import { requireSession } from "@/lib/dal/session";
import { requireFile } from "@/lib/dal/form-data";
import { requireFarmAccess, requireEstablishmentAccess, getEstablishmentFarmId } from "@/lib/dal/farm-access";
import { parseExcelFile } from "@/lib/activities/excel-parsing";
import { applyPesajeColumnMapping, type ColumnMapping } from "@/lib/activities/column-mapping";
import { resolvePesajeBatchRows, type PesajeResolvedRow } from "@/lib/activities/pesaje-resolution";
import { confirmPesajeBatch } from "@/lib/activities/pesaje";
import { rememberedInitialMapping, rememberColumnMeanings } from "@/lib/dal/column-header-meaning";
import { listPaddocksByEstablishment, getPaddockEstablishmentId, createPaddock, type PaddockCatalogEntry } from "@/lib/dal/paddock-catalog";
import { listTagsInPaddock, findAnimalLocationByTag, type AnimalCurrentStateWithNames } from "@/lib/dal/animal-access";

export type PreviewResult =
  | { mappingNeeded: true; headers: string[]; initialMapping: ColumnMapping[] | null }
  | { mappingNeeded: false; eventDateNeeded: true; mapping: ColumnMapping[] }
  | {
      mappingNeeded: false;
      eventDateNeeded: false;
      mapping: ColumnMapping[];
      rows: PesajeResolvedRow[];
    };

export async function previewPesajeBatch(formData: FormData): Promise<PreviewResult> {
  const session = await requireSession();
  const operatingFarmId = formData.get("farmId") as string;
  await requireFarmAccess(session.user.id, session.user.role, operatingFarmId);

  const file = requireFile(formData, "file");
  const eventDateInput = formData.get("eventDate") as string | null;
  const eventDate = eventDateInput && eventDateInput.length > 0 ? eventDateInput : null;
  const mappingOverride = formData.get("mapping") as string | null;
  // "false" for a tropa-by-file upload: the caravanas come from the file but
  // the weight is one total entered afterwards and split evenly, same as
  // previewPesajeTropaBatch's potrero path.
  const requireWeight = (formData.get("requireWeight") as string | null) !== "false";

  const buffer = await file.arrayBuffer();
  const { headers, rows } = await parseExcelFile(buffer);

  let mapping: ColumnMapping[];
  if (mappingOverride) {
    mapping = JSON.parse(mappingOverride) as ColumnMapping[];
  } else {
    return { mappingNeeded: true, headers, initialMapping: await rememberedInitialMapping(headers) };
  }

  const hasDateColumn = mapping.some((m) => m.meaning === "date");
  if (!hasDateColumn && !eventDate) {
    return { mappingNeeded: false, eventDateNeeded: true, mapping };
  }

  const mappedRows = applyPesajeColumnMapping(headers, rows, mapping);
  const rows_ = await resolvePesajeBatchRows(mappedRows, hasDateColumn ? null : eventDate, operatingFarmId, {
    requireWeight,
  });

  return { mappingNeeded: false, eventDateNeeded: false, mapping, rows: rows_ };
}

// "Tropa" mode: the animals come from whatever is currently in the chosen
// potrero (no file to upload) — the weight itself is entered as one total
// afterwards and split evenly in confirmPesajeBatch.
export async function previewPesajeTropaBatch(input: {
  establishmentId: string;
  paddockId: string;
  eventDate: string;
}): Promise<{ farmId: string; rows: PesajeResolvedRow[] }> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, input.establishmentId);

  const paddockEstablishmentId = await getPaddockEstablishmentId(input.paddockId);
  if (paddockEstablishmentId !== input.establishmentId) {
    throw new Error("El potrero no pertenece al campo activo");
  }
  const farmId = await getEstablishmentFarmId(input.establishmentId);
  if (!farmId) {
    throw new Error("El campo no tiene grupo asignado");
  }

  const tags = await listTagsInPaddock(input.paddockId);
  const mappedRows = tags.map((tag) => ({ tag, date: null, notes: null, weight: null }));
  const rows = await resolvePesajeBatchRows(mappedRows, input.eventDate, farmId, { requireWeight: false });

  return { farmId, rows };
}

export async function confirmPesajeBatchAction(input: {
  mapping?: ColumnMapping[];
  farmId: string;
  rows: PesajeResolvedRow[];
  totalWeightKg?: string | null;
}): Promise<void> {
  const session = await requireSession();

  if (input.mapping) {
    await rememberColumnMeanings(input.mapping);
  }

  await confirmPesajeBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingFarmId: input.farmId,
    rows: input.rows,
    totalWeightKg: input.totalWeightKg,
  });
}

// Quick single-caravana weigh-in from the animal detail page — same
// lookup-then-confirm shape as death/retag's own quick actions.
export async function lookupWeighCandidateAction(tag: string): Promise<AnimalCurrentStateWithNames | null> {
  const session = await requireSession();
  const trimmed = tag.trim();
  if (trimmed.length === 0) return null;
  return findAnimalLocationByTag(session.user.id, session.user.role, trimmed);
}

export async function confirmSingleWeighAction(input: { tag: string; eventDate: string; weightKg: string }): Promise<void> {
  const session = await requireSession();

  const state = await findAnimalLocationByTag(session.user.id, session.user.role, input.tag);
  if (!state || state.status !== "alive" || !state.currentEstablishmentId) {
    throw new Error("La caravana no está disponible para pesaje");
  }
  const farmId = await getEstablishmentFarmId(state.currentEstablishmentId);
  if (!farmId) {
    throw new Error("El campo no tiene grupo asignado");
  }

  await confirmPesajeBatch({
    userId: session.user.id,
    role: session.user.role,
    operatingFarmId: farmId,
    rows: [
      {
        tag: input.tag,
        eventDate: input.eventDate,
        notes: null,
        status: "existing",
        animalId: state.animalId,
        currentEstablishmentId: state.currentEstablishmentId,
        weightKg: input.weightKg,
      },
    ],
  });
}

export async function listPesajePaddocksAction(establishmentId: string): Promise<PaddockCatalogEntry[]> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, establishmentId);
  return listPaddocksByEstablishment(establishmentId);
}

export async function createPesajePaddockAction(establishmentId: string, name: string): Promise<PaddockCatalogEntry> {
  const session = await requireSession();
  await requireEstablishmentAccess(session.user.id, session.user.role, establishmentId);
  return createPaddock(establishmentId, name);
}
