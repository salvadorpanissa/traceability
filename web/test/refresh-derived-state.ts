import { sql } from "drizzle-orm";
import { testDb } from "./db";

// animal_current_state used to refresh itself via per-insert triggers; those
// were removed (app code now refreshes once per batch instead — see
// lib/activities/transfer.ts and lib/activities/health.ts) so tests that
// seed event/event_transfer/etc rows directly must refresh explicitly before
// reading the view.
export async function refreshDerivedState() {
  await testDb.execute(sql`refresh materialized view concurrently animal_current_state`);
}
