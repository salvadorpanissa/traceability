import { sql } from "drizzle-orm";
import { db } from "@/db";
import { batchOperation, event, eventPesaje } from "@/db/schema";
import { requireFarmAccess, requireEstablishmentAccess } from "@/lib/dal/farm-access";
import type { PesajeResolvedRow } from "@/lib/activities/pesaje-resolution";
import { logError } from "@/lib/logger";

// See the equivalent comment in recategorize.ts: the preview round-trips
// through the browser, so animalId/currentEstablishmentId are
// attacker-controlled by confirm time — every write below is keyed off a
// fresh re-read of animal_current_state, not the client-supplied row.
const STALE_BATCH_ERROR = "El lote cambió desde que se generó la vista previa; volvé a subir el archivo.";

type FreshState = { animal_id: string; current_establishment_id: string | null; current_farm_id: string | null; status: string };

async function loadFreshState(animalIds: string[]): Promise<Map<string, FreshState>> {
  if (animalIds.length === 0) return new Map();
  const idList = sql.join(
    animalIds.map((id) => sql`${id}`),
    sql`, `
  );
  const result = await db.execute<FreshState>(sql`
    select acs.animal_id, acs.current_establishment_id, e.farm_id as current_farm_id, acs.status
    from animal_current_state acs
    left join establishment e on e.id = acs.current_establishment_id
    where acs.animal_id in (${idList})
  `);
  return new Map(result.rows.map((row) => [row.animal_id, row]));
}

// "420,5" -> "420.5"; used for the total-truckload weight, same format as
// what parseWeightKg in pesaje-resolution.ts accepts per row.
function parseTotalWeightKg(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value > 0 ? value : null;
}

export async function confirmPesajeBatch(input: {
  userId: string;
  role: string | undefined;
  operatingFarmId: string;
  rows: PesajeResolvedRow[];
  // Set only for a "tropa" weigh-in (whole truckload on a scale away from
  // the establecimiento, no per-animal reading available): every confirmed
  // animal gets totalWeightKg / headCount as an estimated weightKg instead
  // of the value on its row.
  totalWeightKg?: string | null;
}): Promise<void> {
  const { userId, role, operatingFarmId, rows, totalWeightKg } = input;

  await requireFarmAccess(userId, role, operatingFarmId);

  if (rows.some((row) => row.status === "error")) {
    throw new Error("El lote tiene filas con error; no se puede confirmar");
  }
  const confirmableRows = rows.filter(
    (row): row is Extract<PesajeResolvedRow, { status: "existing" }> => row.status === "existing"
  );
  if (confirmableRows.length === 0) {
    throw new Error("No hay animales para pesar");
  }

  let averageWeightKg: string | null = null;
  if (totalWeightKg) {
    const total = parseTotalWeightKg(totalWeightKg);
    if (!total) {
      throw new Error("El peso total no es válido");
    }
    averageWeightKg = (total / confirmableRows.length).toFixed(1);
  } else if (confirmableRows.some((row) => !row.weightKg)) {
    throw new Error("Falta el peso de uno o más animales");
  }
  const estimated = averageWeightKg !== null;

  const animalIds = [...new Set(confirmableRows.map((row) => row.animalId))];
  const freshStateByAnimalId = await loadFreshState(animalIds);

  const changesByEstablishment = new Map<
    string,
    { animalId: string; eventDate: string; notes: string | null; weightKg: string }[]
  >();
  for (const row of confirmableRows) {
    const state = freshStateByAnimalId.get(row.animalId);
    if (!state || state.status !== "alive" || !state.current_establishment_id || state.current_farm_id !== operatingFarmId) {
      throw new Error(STALE_BATCH_ERROR);
    }
    const list = changesByEstablishment.get(state.current_establishment_id) ?? [];
    // row.weightKg is guaranteed non-null here: either averageWeightKg was
    // computed above, or the !row.weightKg check already rejected the batch.
    list.push({ animalId: row.animalId, eventDate: row.eventDate, notes: row.notes, weightKg: averageWeightKg ?? row.weightKg! });
    changesByEstablishment.set(state.current_establishment_id, list);
  }

  // One transaction per campo, attempted independently — same reasoning as
  // confirmRecategorizeBatch: a failure on one campo must not roll back or
  // silently swallow the others.
  const succeededEstablishmentIds: string[] = [];
  const failedEstablishmentIds: string[] = [];
  for (const [establishmentId, changes] of changesByEstablishment) {
    try {
      await requireEstablishmentAccess(userId, role, establishmentId);
      await db.transaction(async (tx) => {
        const [batch] = await tx
          .insert(batchOperation)
          .values({ eventType: "pesaje", establishmentId, animalCount: changes.length, createdBy: userId })
          .returning();

        for (const change of changes) {
          const [pesajeEvent] = await tx
            .insert(event)
            .values({
              eventType: "pesaje",
              eventDate: change.eventDate,
              animalId: change.animalId,
              establishmentId,
              batchOperationId: batch.id,
              createdBy: userId,
              notes: change.notes,
            })
            .returning();

          await tx.insert(eventPesaje).values({ eventId: pesajeEvent.id, weightKg: change.weightKg, estimated });
        }
      });
      succeededEstablishmentIds.push(establishmentId);
    } catch (error) {
      logError("confirmPesajeBatch.establishmentFailed", error, { establishmentId });
      failedEstablishmentIds.push(establishmentId);
    }
  }

  // No animal_current_state refresh: pesaje never changes establishment,
  // paddock, category or status, so nothing that view derives is stale.
  if (failedEstablishmentIds.length > 0) {
    const succeededText =
      succeededEstablishmentIds.length > 0
        ? `Campos confirmados: ${succeededEstablishmentIds.join(", ")}.`
        : "Ningún campo se confirmó.";
    throw new Error(`No se pudo confirmar el pesaje en los campos: ${failedEstablishmentIds.join(", ")}. ${succeededText}`);
  }
}
