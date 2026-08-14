import { and, eq, inArray, sql } from "drizzle-orm";
import { batchOperation, event, eventTransfer, eventHealth, paddock, product } from "@/db/schema";
import { db } from "@/db";
import { requireEstablishmentAccess, getEstablishmentFarmId } from "@/lib/dal/farm-access";
import { createNewAnimal } from "@/lib/activities/animal-creation";
import { gapFillBreed, gapFillSecondaryTag } from "@/lib/activities/gap-fill";
import { updateReproductiveStatus } from "@/lib/activities/reproductive-status-update";
import type { ResolvedRow } from "@/lib/activities/batch-resolution";
import { isSameEstablishmentMismatch } from "@/lib/activities/health-paddock-mismatch";

export type HealthProduct = {
  productId: string;
  dose: string;
  doseUnit: string;
  route: string;
  withdrawalDays: number | null;
  notes: string | null;
};

// findPaddockMismatches/PaddockMismatch live in health-paddock-mismatch.ts,
// a pure module with no `db` import — HealthForm (a client component) needs
// the detection logic without pulling the server-only `pg` client (and its
// `dns` import) into the browser bundle.

export async function confirmHealthBatch(input: {
  userId: string;
  role: string | undefined;
  operatingEstablishmentId: string;
  products: HealthProduct[];
  rows: ResolvedRow[];
  paddockId: string | null;
  transferMismatchedToPaddock?: boolean;
}): Promise<void> {
  const {
    userId,
    role,
    operatingEstablishmentId,
    products,
    rows,
    paddockId,
    transferMismatchedToPaddock = false,
  } = input;

  await requireEstablishmentAccess(userId, role, operatingEstablishmentId);

  if (products.length === 0) {
    throw new Error("Hay que elegir al menos un producto");
  }
  if (rows.some((row) => row.status === "error")) {
    throw new Error("El lote tiene filas con error; no se puede confirmar");
  }
  if (
    rows.some(
      (row) => (row.status === "new" || (row.status === "foreign" && row.forced)) && row.pendingOwnerName
    )
  ) {
    throw new Error("El lote tiene propietarios pendientes de crear; no se puede confirmar");
  }
  if (paddockId) {
    const [paddockRow] = await db.select().from(paddock).where(eq(paddock.id, paddockId));
    if (!paddockRow || paddockRow.establishmentId !== operatingEstablishmentId) {
      throw new Error("El potrero no pertenece al campo activo");
    }
  }

  const farmId = await getEstablishmentFarmId(operatingEstablishmentId);
  const productIds = [...new Set(products.map((p) => p.productId))];
  const validProductRows = farmId
    ? await db
        .select({ id: product.id })
        .from(product)
        .where(and(inArray(product.id, productIds), eq(product.farmId, farmId)))
    : [];
  if (validProductRows.length !== productIds.length) {
    throw new Error("Uno de los productos no pertenece al grupo del campo activo");
  }

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(batchOperation)
      .values({ eventType: "health", establishmentId: operatingEstablishmentId, animalCount: rows.length, createdBy: userId })
      .returning();

    for (const row of rows) {
      if (row.status === "error") continue;
      if (row.status === "foreign" && !row.forced) continue;

      let animalId: string;

      if (row.status === "existing") {
        animalId = row.animalId;
        await gapFillBreed(tx, animalId, row.breed);
        await gapFillSecondaryTag(tx, animalId, row.secondaryTag);
        await updateReproductiveStatus(tx, animalId, row.reproductiveStatusId ?? null);
      } else {
        animalId = await createNewAnimal(tx, { userId, operatingEstablishmentId, batchId: batch.id, row });

        // Sanidad doesn't relocate animals, but a brand-new one still needs a
        // transfer event to be visible in animal_current_state (which only
        // derives current_establishment_id from event_transfer) — this places
        // it at the establecimiento it was loaded from, origin = destination,
        // and at the potrero the sanidad was performed in, if one was chosen.
        const [placementEvent] = await tx
          .insert(event)
          .values({
            eventType: "transfer",
            eventDate: row.eventDate,
            animalId,
            establishmentId: operatingEstablishmentId,
            batchOperationId: batch.id,
            createdBy: userId,
          })
          .returning();
        await tx.insert(eventTransfer).values({
          eventId: placementEvent.id,
          originEstablishmentId: operatingEstablishmentId,
          destinationEstablishmentId: operatingEstablishmentId,
          originPaddockId: null,
          destinationPaddockId: paddockId,
        });
      }

      for (const healthProduct of products) {
        const [healthEvent] = await tx
          .insert(event)
          .values({
            eventType: "health",
            eventDate: row.eventDate,
            animalId,
            establishmentId: operatingEstablishmentId,
            batchOperationId: batch.id,
            createdBy: userId,
            notes: row.notes,
          })
          .returning();

        await tx.insert(eventHealth).values({
          eventId: healthEvent.id,
          productId: healthProduct.productId,
          dose: healthProduct.dose,
          doseUnit: healthProduct.doseUnit,
          route: healthProduct.route,
          withdrawalDays: healthProduct.withdrawalDays,
          notes: healthProduct.notes,
          paddockId,
        });
      }
    }

    // Sanidad doesn't relocate animals on its own, but the user can opt into
    // also moving any existing animal whose current potrero differs from
    // the one the sanidad was performed in — same batch, same transaction.
    if (transferMismatchedToPaddock && paddockId) {
      // The traslado records when the physical relocation happens (now), not
      // when the historical sanidad took place — a backdated eventDate would
      // lose to the animal's latest real transfer in animal_current_state and
      // silently move nothing.
      const relocationDate = new Date().toISOString().slice(0, 10);
      for (const row of rows) {
        if (!isSameEstablishmentMismatch(row, paddockId, operatingEstablishmentId)) continue;
        const [transferEvent] = await tx
          .insert(event)
          .values({
            eventType: "transfer",
            eventDate: relocationDate,
            animalId: row.animalId,
            establishmentId: operatingEstablishmentId,
            batchOperationId: batch.id,
            createdBy: userId,
          })
          .returning();
        await tx.insert(eventTransfer).values({
          eventId: transferEvent.id,
          originEstablishmentId: operatingEstablishmentId,
          destinationEstablishmentId: operatingEstablishmentId,
          originPaddockId: row.currentPaddockId,
          destinationPaddockId: paddockId,
        });
      }
    }

    // See the equivalent comment in transfer.ts: this replaces N per-row
    // AFTER INSERT refreshes with a single refresh after the whole batch.
    await tx.execute(sql`refresh materialized view concurrently animal_current_state`);
  });
}

// Undoes a whole health batch (e.g. one confirmed twice by mistake) without
// deleting anything — inserts a 'void' event per row, which every derived
// view (animal_current_state, withdrawal, stale-tag) already knows to skip.
export async function voidHealthBatch(input: {
  userId: string;
  role: string | undefined;
  batchOperationId: string;
}): Promise<void> {
  const { userId, role, batchOperationId } = input;

  const [batch] = await db.select().from(batchOperation).where(eq(batchOperation.id, batchOperationId));
  if (!batch || batch.eventType !== "health") {
    throw new Error("El lote no existe o no es una sanidad");
  }
  await requireEstablishmentAccess(userId, role, batch.establishmentId);

  const batchEvents = await db.select().from(event).where(eq(event.batchOperationId, batchOperationId));
  const liveEvents = batchEvents.filter((e) => e.eventType !== "void");
  if (liveEvents.length === 0) return;
  const alreadyVoidedIds = new Set(
    batchEvents.filter((e) => e.eventType === "void").map((e) => e.voidsEventId)
  );
  const eventsToVoid = liveEvents.filter((e) => !alreadyVoidedIds.has(e.id));
  if (eventsToVoid.length === 0) return;

  await db.transaction(async (tx) => {
    await tx.insert(event).values(
      eventsToVoid.map((e) => ({
        eventType: "void" as const,
        eventDate: e.eventDate,
        animalId: e.animalId,
        establishmentId: e.establishmentId,
        batchOperationId: e.batchOperationId,
        createdBy: userId,
        voidsEventId: e.id,
      }))
    );
    await tx.execute(sql`refresh materialized view concurrently animal_current_state`);
  });
}
