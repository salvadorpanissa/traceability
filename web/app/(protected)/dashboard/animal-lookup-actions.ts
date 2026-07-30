"use server";

import { requireSession } from "@/lib/dal/session";
import { findAnimalDetailByTag, type AnimalLookupDetail } from "@/lib/dal/animal-access";

export async function lookupAnimalByTagAction(tag: string): Promise<AnimalLookupDetail | null> {
  const session = await requireSession();
  const trimmed = tag.trim();
  if (trimmed.length === 0) return null;
  return findAnimalDetailByTag(session.user.id, session.user.role, trimmed);
}
