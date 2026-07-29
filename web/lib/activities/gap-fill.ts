import { desc, eq } from "drizzle-orm";
import { animal, animalTagHistory } from "@/db/schema";
import type { db } from "@/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Fills a currently-empty animal.breed from an activity row's Excel column —
// never overwrites a value that's already there.
export async function gapFillBreed(
  tx: Transaction,
  animalId: string,
  breed: string | null | undefined
): Promise<void> {
  if (!breed) return;
  const [currentAnimal] = await tx.select({ breed: animal.breed }).from(animal).where(eq(animal.id, animalId));
  if (currentAnimal?.breed) return;
  await tx.update(animal).set({ breed }).where(eq(animal.id, animalId));
}

// Fills a currently-empty secondary_tag on the animal's *current*
// animal_tag_history row (highest valid_from) via UPDATE — never via a new
// INSERT, which would repeat the row's existing `tag` and collide with
// animal_tag_history_tag_idx.
export async function gapFillSecondaryTag(
  tx: Transaction,
  animalId: string,
  secondaryTag: string | null | undefined
): Promise<void> {
  if (!secondaryTag) return;
  const [currentRow] = await tx
    .select({ id: animalTagHistory.id, secondaryTag: animalTagHistory.secondaryTag })
    .from(animalTagHistory)
    .where(eq(animalTagHistory.animalId, animalId))
    .orderBy(desc(animalTagHistory.validFrom))
    .limit(1);
  if (!currentRow || currentRow.secondaryTag) return;
  await tx.update(animalTagHistory).set({ secondaryTag }).where(eq(animalTagHistory.id, currentRow.id));
}
