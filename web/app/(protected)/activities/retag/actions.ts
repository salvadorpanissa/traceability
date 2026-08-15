"use server";

import { requireSession } from "@/lib/dal/session";
import { findAnimalLocationByTag, type AnimalCurrentStateWithNames } from "@/lib/dal/animal-access";
import { confirmRetagEvent } from "@/lib/activities/retag";

export async function lookupRetagCandidateAction(tag: string): Promise<AnimalCurrentStateWithNames | null> {
  const session = await requireSession();
  const trimmed = tag.trim();
  if (trimmed.length === 0) return null;
  return findAnimalLocationByTag(session.user.id, session.user.role, trimmed);
}

export async function confirmRetagAction(input: { tag: string; newTag: string; eventDate: string }): Promise<void> {
  const session = await requireSession();
  await confirmRetagEvent({
    userId: session.user.id,
    role: session.user.role,
    tag: input.tag,
    newTag: input.newTag,
    eventDate: input.eventDate,
  });
}
