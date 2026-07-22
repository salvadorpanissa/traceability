import { animal, animalTagHistory, event, eventRetag, eventRecategorize } from "@/db/schema";
import type { CreatableRow } from "@/lib/activities/batch-resolution";
import type { db } from "@/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createNewAnimal(
  tx: Transaction,
  input: {
    userId: string;
    operatingFarmId: string;
    batchId: string;
    row: CreatableRow;
  }
): Promise<string> {
  const { userId, operatingFarmId, batchId, row } = input;

  const [createdAnimal] = await tx.insert(animal).values({ sex: row.sex, ownerId: row.ownerId }).returning();
  await tx.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: row.tag });

  // Self-retag: establishes the new animal's current_tag in the derived
  // state view, which only reflects the *last event_retag*, not
  // animal_tag_history directly.
  const [retagEvent] = await tx
    .insert(event)
    .values({
      eventType: "retag",
      eventDate: row.eventDate,
      animalId: createdAnimal.id,
      farmId: operatingFarmId,
      batchOperationId: batchId,
      createdBy: userId,
    })
    .returning();
  await tx.insert(eventRetag).values({ eventId: retagEvent.id, oldTag: row.tag, newTag: row.tag });

  // Self-recategorize: only when the row carried an initial category — an
  // animal with none stays uncategorized until a real recategorize event is
  // loaded later.
  if (row.categoryId) {
    const [recategorizeEvent] = await tx
      .insert(event)
      .values({
        eventType: "recategorize",
        eventDate: row.eventDate,
        animalId: createdAnimal.id,
        farmId: operatingFarmId,
        batchOperationId: batchId,
        createdBy: userId,
      })
      .returning();
    await tx
      .insert(eventRecategorize)
      .values({ eventId: recategorizeEvent.id, oldCategoryId: row.categoryId, newCategoryId: row.categoryId });
  }

  return createdAnimal.id;
}
