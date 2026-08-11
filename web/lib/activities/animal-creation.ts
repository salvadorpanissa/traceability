import { eq } from "drizzle-orm";
import { animal, animalTagHistory, event, eventRetag, eventRecategorize, category } from "@/db/schema";
import type { CreatableRow } from "@/lib/activities/batch-resolution";
import { deduceAgeMonthsForCategory } from "@/lib/activities/category-birth-date";
import { estimateBirthDateFromAge } from "@/lib/activities/date-normalization";
import type { db } from "@/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createNewAnimal(
  tx: Transaction,
  input: {
    userId: string;
    operatingEstablishmentId: string;
    batchId: string;
    row: CreatableRow;
  }
): Promise<string> {
  const { userId, operatingEstablishmentId, batchId, row } = input;

  // No birth date on the row, but a category that implies an age bracket
  // (e.g. "Novillo 2-3 años") — deduce one instead of leaving it unknown,
  // anchored to this row's own event date rather than "today" so a batch
  // imported for a past date doesn't get an age computed as of now.
  let birthDate = row.birthDate;
  if (!birthDate && row.categoryId) {
    const [ownCategory] = await tx.select({ farmId: category.farmId }).from(category).where(eq(category.id, row.categoryId));
    const categories = ownCategory
      ? await tx
          .select({ id: category.id, minAgeMonths: category.minAgeMonths })
          .from(category)
          .where(eq(category.farmId, ownCategory.farmId))
      : [];
    const ageMonths = deduceAgeMonthsForCategory(row.categoryId, categories);
    if (ageMonths !== null) birthDate = estimateBirthDateFromAge(row.eventDate, ageMonths);
  }

  const [createdAnimal] = await tx
    .insert(animal)
    .values({ sex: row.sex, ownerId: row.ownerId, birthDate, breed: row.breed ?? null })
    .returning();
  await tx.insert(animalTagHistory).values({ animalId: createdAnimal.id, tag: row.tag, secondaryTag: row.secondaryTag ?? null });

  // Self-retag: establishes the new animal's current_tag in the derived
  // state view, which only reflects the *last event_retag*, not
  // animal_tag_history directly.
  const [retagEvent] = await tx
    .insert(event)
    .values({
      eventType: "retag",
      eventDate: row.eventDate,
      animalId: createdAnimal.id,
      establishmentId: operatingEstablishmentId,
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
        establishmentId: operatingEstablishmentId,
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
