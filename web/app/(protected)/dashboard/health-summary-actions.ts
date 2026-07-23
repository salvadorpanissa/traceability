"use server";

import { requireSession } from "@/lib/dal/session";
import { visibleHealthEventsSince } from "@/lib/dal/health-event-access";
import { summarizeHealthByPlace, monthsAgoISODate, type HealthByPlaceRow } from "@/lib/dashboard/health-place-summary";

export async function loadHealthByPlaceAction(months: number): Promise<HealthByPlaceRow[]> {
  const session = await requireSession();
  const sinceDate = monthsAgoISODate(months);
  const rows = await visibleHealthEventsSince(session.user.id, session.user.role, sinceDate);
  return summarizeHealthByPlace(rows);
}
