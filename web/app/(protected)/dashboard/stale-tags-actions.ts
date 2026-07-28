"use server";

import { requireSession } from "@/lib/dal/session";
import { findStaleTags, type StaleTagRow } from "@/lib/dashboard/stale-tag-summary";

export async function getStaleTagsAction(thresholdDays: number): Promise<StaleTagRow[]> {
  const session = await requireSession();
  return findStaleTags(session.user.id, session.user.role, thresholdDays);
}
