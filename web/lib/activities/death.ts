import { sql } from "drizzle-orm";
import { db } from "@/db";
import { batchOperation, event, eventDeath } from "@/db/schema";
import { findAnimalLocationByTag } from "@/lib/dal/animal-access";

const STATUS_LABEL: Record<string, string> = {
  dead: "muerta",
  sold: "vendida",
};

export async function confirmDeathEvent(input: {
  userId: string;
  role: string | undefined;
  tag: string;
  eventDate: string;
  cause: string | null;
}): Promise<void> {
  const { userId, role, tag, eventDate, cause } = input;

  // findAnimalLocationByTag already scopes by the caller's campos — a tag
  // on a farm the user can't see comes back null, same as an unknown tag,
  // so there is no separate farm-access check to run here.
  const state = await findAnimalLocationByTag(userId, role, tag);
  if (!state) {
    throw new Error("No se encontró esa caravana o no tenés acceso a su campo");
  }
  if (state.status !== "alive") {
    throw new Error(`La caravana ya está registrada como ${STATUS_LABEL[state.status] ?? state.status}`);
  }
  if (!state.currentFarmId) {
    throw new Error("La caravana no tiene un campo asignado; no se puede registrar la muerte");
  }

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(batchOperation)
      .values({ eventType: "death", farmId: state.currentFarmId!, animalCount: 1, createdBy: userId })
      .returning();

    const [deathEvent] = await tx
      .insert(event)
      .values({
        eventType: "death",
        eventDate,
        animalId: state.animalId,
        farmId: state.currentFarmId!,
        batchOperationId: batch.id,
        createdBy: userId,
      })
      .returning();

    await tx.insert(eventDeath).values({ eventId: deathEvent.id, cause });

    await tx.execute(sql`refresh materialized view concurrently animal_current_state`);
  });
}
