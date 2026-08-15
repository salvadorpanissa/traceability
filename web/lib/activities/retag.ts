import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { animalTagHistory, batchOperation, event, eventRetag } from "@/db/schema";
import { findAnimalLocationByTag } from "@/lib/dal/animal-access";
import { isUniqueViolationError } from "@/lib/dal/unique-violation";

const STATUS_LABEL: Record<string, string> = {
  dead: "muerta",
  sold: "vendida",
};

// Both ear tags an animal wears are lost, so a fresh (previously-unused) tag
// number is assigned. The secondary tag (e.g. a bull's subcutaneous chip) is
// unrelated to the ear tags and must survive the change untouched — but
// animal_tag_history_secondary_tag_idx is a table-wide unique index, so the
// only way to carry the same value onto the new row is to clear it off the
// old one first, in the same transaction.
export async function confirmRetagEvent(input: {
  userId: string;
  role: string | undefined;
  tag: string;
  newTag: string;
  eventDate: string;
}): Promise<void> {
  const { userId, role, tag, newTag, eventDate } = input;

  const state = await findAnimalLocationByTag(userId, role, tag);
  if (!state) {
    throw new Error("No se encontró esa caravana o no tenés acceso a su campo");
  }
  if (state.status !== "alive") {
    throw new Error(`La caravana ya está registrada como ${STATUS_LABEL[state.status] ?? state.status}`);
  }
  if (!state.currentEstablishmentId) {
    throw new Error("La caravana no tiene un campo asignado; no se puede recaravanear");
  }
  const oldTag = state.currentTag ?? tag;

  try {
    await db.transaction(async (tx) => {
      const [currentRow] = await tx
        .select({ id: animalTagHistory.id, secondaryTag: animalTagHistory.secondaryTag })
        .from(animalTagHistory)
        .where(eq(animalTagHistory.animalId, state.animalId))
        .orderBy(desc(animalTagHistory.validFrom))
        .limit(1);

      if (currentRow?.secondaryTag) {
        await tx.update(animalTagHistory).set({ secondaryTag: null }).where(eq(animalTagHistory.id, currentRow.id));
      }

      await tx.insert(animalTagHistory).values({
        animalId: state.animalId,
        tag: newTag,
        secondaryTag: currentRow?.secondaryTag ?? null,
      });

      const [batch] = await tx
        .insert(batchOperation)
        .values({ eventType: "retag", establishmentId: state.currentEstablishmentId!, animalCount: 1, createdBy: userId })
        .returning();

      const [retagEvent] = await tx
        .insert(event)
        .values({
          eventType: "retag",
          eventDate,
          animalId: state.animalId,
          establishmentId: state.currentEstablishmentId!,
          batchOperationId: batch.id,
          createdBy: userId,
        })
        .returning();

      await tx.insert(eventRetag).values({ eventId: retagEvent.id, oldTag, newTag });

      await tx.execute(sql`refresh materialized view concurrently animal_current_state`);
    });
  } catch (error) {
    if (isUniqueViolationError(error)) {
      throw new Error("Esa caravana ya está en uso");
    }
    throw error;
  }
}
