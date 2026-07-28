"use server";

import { requireSession } from "@/lib/dal/session";
import { findAnimalLocationByTag, type AnimalCurrentStateWithNames } from "@/lib/dal/animal-access";
import { confirmDeathEvent } from "@/lib/activities/death";

export async function lookupDeathCandidateAction(tag: string): Promise<AnimalCurrentStateWithNames | null> {
  const session = await requireSession();
  const trimmed = tag.trim();
  if (trimmed.length === 0) return null;
  return findAnimalLocationByTag(session.user.id, session.user.role, trimmed);
}

export async function confirmDeathAction(input: { tag: string; eventDate: string; cause: string | null }): Promise<void> {
  const session = await requireSession();
  await confirmDeathEvent({
    userId: session.user.id,
    role: session.user.role,
    tag: input.tag,
    eventDate: input.eventDate,
    cause: input.cause,
  });
}
