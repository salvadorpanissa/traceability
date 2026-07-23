"use server";

import { requireSession } from "@/lib/dal/session";
import { findAnimalLocationByTag, type AnimalCurrentStateWithNames } from "@/lib/dal/animal-access";

export async function lookupAnimalByTagAction(tag: string): Promise<AnimalCurrentStateWithNames | null> {
  const session = await requireSession();
  const trimmed = tag.trim();
  if (trimmed.length === 0) return null;
  return findAnimalLocationByTag(session.user.id, session.user.role, trimmed);
}
