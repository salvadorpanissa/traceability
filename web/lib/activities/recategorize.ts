import { isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { batchOperation, category, event, eventRecategorize } from "@/db/schema";
import { requireFarmAccess } from "@/lib/dal/farm-access";
import { computeAgeMonths, resolveCategoryForAge } from "@/lib/activities/age-recategorization";
import type { RecategorizeResolvedRow, UnresolvableDecision } from "@/lib/activities/recategorize-resolution";

type PlannedChange = {
  animalId: string;
  farmId: string;
  eventDate: string;
  notes: string | null;
  oldCategoryId: string;
  newCategoryId: string;
  source: "manual" | "initial";
};

// The preview's farm/category data round-trips through the browser, so by the
// time it comes back it is attacker-controlled input, not a server fact: a
// user could claim any animal sits on a campo they happen to have access to
// and have events written against it. It can also simply be stale (the animal
// was transferred or recategorized between preview and confirm). Everything
// security- or correctness-relevant is therefore re-read from
// animal_current_state here; the client row only supplies routing (which
// branch to run), the event date and the free-text notes.
type FreshState = {
  animal_id: string;
  current_farm_id: string | null;
  current_category_id: string | null;
  status: string;
  birth_date: string | null;
  sex: "male" | "female" | null;
};

const STALE_BATCH_ERROR = "El lote cambió desde que se generó la vista previa; volvé a subir el archivo.";

async function loadFreshState(animalIds: string[]): Promise<Map<string, FreshState>> {
  if (animalIds.length === 0) return new Map();
  const idList = sql.join(
    animalIds.map((id) => sql`${id}`),
    sql`, `
  );
  const result = await db.execute<FreshState>(sql`
    select acs.animal_id, acs.current_farm_id, acs.current_category_id, acs.status,
           a.birth_date, a.sex
    from animal_current_state acs
    join animal a on a.id = acs.animal_id
    where acs.animal_id in (${idList})
  `);
  return new Map(result.rows.map((row) => [row.animal_id, row]));
}

export async function confirmRecategorizeBatch(input: {
  userId: string;
  role: string | undefined;
  targetCategoryId: string;
  rows: RecategorizeResolvedRow[];
  unresolvableDecisions: Record<string, UnresolvableDecision>;
}): Promise<void> {
  const { userId, role, targetCategoryId, rows, unresolvableDecisions } = input;

  if (rows.some((row) => row.status === "error")) {
    throw new Error("El lote tiene filas con error; no se puede confirmar");
  }

  const animalIds = [...new Set(rows.filter((row) => row.status !== "error").map((row) => row.animalId))];
  const freshStateByAnimalId = await loadFreshState(animalIds);

  const needsAgeResolution = rows.some((row) => row.status === "age-resolved" || row.status === "age-unresolvable");
  const ageManagedCategories = needsAgeResolution
    ? await db
        .select({ id: category.id, sex: category.sex, minAgeMonths: category.minAgeMonths })
        .from(category)
        .where(isNotNull(category.minAgeMonths))
    : [];

  const plannedChanges: PlannedChange[] = [];
  for (const row of rows) {
    if (row.status === "error") continue;

    const state = freshStateByAnimalId.get(row.animalId);
    if (!state || state.status !== "alive" || !state.current_farm_id) {
      throw new Error(STALE_BATCH_ERROR);
    }
    const farmId = state.current_farm_id;

    if (row.status === "existing") {
      // The preview said this animal already had a category; if the DB no
      // longer agrees on which one, someone else moved it in the meantime.
      if (state.current_category_id === null || state.current_category_id !== row.currentCategoryId) {
        throw new Error(STALE_BATCH_ERROR);
      }
      if (state.current_category_id === targetCategoryId) continue;
      plannedChanges.push({
        animalId: row.animalId,
        farmId,
        eventDate: row.eventDate,
        notes: row.notes,
        oldCategoryId: state.current_category_id,
        newCategoryId: targetCategoryId,
        source: "manual",
      });
      continue;
    }

    // Both remaining branches previewed the animal as having NO category —
    // if it has one now, the preview is stale.
    if (state.current_category_id !== null) {
      throw new Error(STALE_BATCH_ERROR);
    }

    // Re-derive the age-based category from the DB rather than trusting the
    // resolvedCategoryId the client sent back.
    const resolvedCategoryId =
      state.birth_date && state.sex
        ? resolveCategoryForAge(ageManagedCategories, state.sex, computeAgeMonths(state.birth_date, row.eventDate))
        : null;

    if (row.status === "age-resolved") {
      if (!resolvedCategoryId) throw new Error(STALE_BATCH_ERROR);
      plannedChanges.push({
        animalId: row.animalId,
        farmId,
        eventDate: row.eventDate,
        notes: row.notes,
        oldCategoryId: resolvedCategoryId,
        newCategoryId: resolvedCategoryId,
        source: "initial",
      });
      continue;
    }

    // age-unresolvable
    if (resolvedCategoryId) throw new Error(STALE_BATCH_ERROR);
    const decision = unresolvableDecisions[row.animalId] ?? "skip";
    if (decision === "skip") continue;
    plannedChanges.push({
      animalId: row.animalId,
      farmId,
      eventDate: row.eventDate,
      notes: row.notes,
      oldCategoryId: targetCategoryId,
      newCategoryId: targetCategoryId,
      source: "initial",
    });
  }

  if (plannedChanges.length === 0) {
    throw new Error("Ningún animal cambia de categoría; no se puede confirmar");
  }

  const involvedFarmIds = [...new Set(plannedChanges.map((c) => c.farmId))];
  for (const farmId of involvedFarmIds) {
    await requireFarmAccess(userId, role, farmId);
  }

  const changesByFarm = new Map<string, PlannedChange[]>();
  for (const change of plannedChanges) {
    const list = changesByFarm.get(change.farmId) ?? [];
    list.push(change);
    changesByFarm.set(change.farmId, list);
  }

  // One transaction per campo, each attempted independently: a failure on one
  // campo must neither roll back nor skip the others, and — unlike the
  // background age-recategorization job — must never be swallowed, since a
  // user is waiting on the result and needs to know what actually landed.
  const succeededFarmIds: string[] = [];
  const failedFarmIds: string[] = [];
  for (const [farmId, changes] of changesByFarm) {
    try {
      await db.transaction(async (tx) => {
        const [batch] = await tx
          .insert(batchOperation)
          .values({
            eventType: "recategorize",
            farmId,
            animalCount: changes.length,
            createdBy: userId,
          })
          .returning();

        for (const change of changes) {
          const [createdEvent] = await tx
            .insert(event)
            .values({
              eventType: "recategorize",
              eventDate: change.eventDate,
              animalId: change.animalId,
              farmId,
              batchOperationId: batch.id,
              createdBy: userId,
              notes: change.notes,
            })
            .returning();

          await tx.insert(eventRecategorize).values({
            eventId: createdEvent.id,
            oldCategoryId: change.oldCategoryId,
            newCategoryId: change.newCategoryId,
            source: change.source,
          });
        }
      });
      succeededFarmIds.push(farmId);
    } catch (error) {
      console.error(`confirmRecategorizeBatch: failed to recategorize farm ${farmId}`, error);
      failedFarmIds.push(farmId);
    }
  }

  // Always refreshed, even on partial failure, so the campos that did succeed
  // are immediately visible instead of waiting on some unrelated refresh.
  await db.execute(sql`refresh materialized view concurrently animal_current_state`);

  if (failedFarmIds.length > 0) {
    const succeededText =
      succeededFarmIds.length > 0 ? `Campos confirmados: ${succeededFarmIds.join(", ")}.` : "Ningún campo se confirmó.";
    throw new Error(
      `No se pudo confirmar la recategorización en los campos: ${failedFarmIds.join(", ")}. ${succeededText}`
    );
  }
}
