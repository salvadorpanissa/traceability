import type { PoolClient } from "pg";
import { reportingPool } from "@/db/reporting";
import { isAdmin, userFarmIds } from "@/lib/dal/farm-access";

// Farm-scoped views: created as `WHERE <farmColumn> = ANY($1)` for non-admins,
// unfiltered for admins. `source` and `farmColumn` come from this fixed,
// developer-controlled list — never from user or LLM input — so the string
// interpolation used to build the CREATE TEMP VIEW statements below is safe.
// `source` values are schema-qualified with `reporting_named.` — the 0019
// migration moved all 12 named views into a dedicated `reporting_named`
// schema that is never on reporting_ro's search_path, so an LLM-generated
// query can no longer reach them unqualified (see
// drizzle/0019_isolate_reporting_named_views.sql for the full rationale).
const SCOPED_VIEWS_BY_FARM = [
  { name: "my_animal_state", source: "reporting_named.animal_current_state_named", farmColumn: "current_farm_id" },
  { name: "my_farms", source: "reporting_named.farm_named", farmColumn: "id" },
  { name: "my_paddocks", source: "reporting_named.paddock_named", farmColumn: "farm_id" },
  { name: "my_transfer_events", source: "reporting_named.transfer_events_named", farmColumn: "farm_id" },
  { name: "my_health_events", source: "reporting_named.health_events_named", farmColumn: "farm_id" },
  { name: "my_retag_events", source: "reporting_named.retag_events_named", farmColumn: "farm_id" },
  {
    name: "my_recategorize_events",
    source: "reporting_named.recategorize_events_named",
    farmColumn: "farm_id",
  },
  { name: "my_sale_events", source: "reporting_named.sale_events_named", farmColumn: "farm_id" },
  { name: "my_death_events", source: "reporting_named.death_events_named", farmColumn: "farm_id" },
] as const;

// Global catalogs: no farm scoping — same for every user.
const GLOBAL_CATALOG_VIEWS = [
  { name: "my_categories", source: "reporting_named.category_named" },
  { name: "my_products", source: "reporting_named.product_named" },
  { name: "my_owners", source: "reporting_named.owner_named" },
] as const;

export const REPORTING_VIEW_NAMES: readonly string[] = [
  ...SCOPED_VIEWS_BY_FARM.map((v) => v.name),
  ...GLOBAL_CATALOG_VIEWS.map((v) => v.name),
];

export async function withScopedReportingViews<T>(
  userId: string,
  role: string | undefined,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const admin = isAdmin(role);
  const farmIds = admin ? [] : await userFarmIds(userId);

  const client = await reportingPool.connect();
  try {
    // `CREATE VIEW` cannot itself take a bound parameter, and Postgres also
    // rejects `CREATE VIEW` (even TEMP) inside a READ ONLY transaction. So we
    // (1) start a normal read-write transaction, (2) pass the caller's farm
    // ids in via a session-local `set_config` call (a bound parameter, never
    // interpolated into SQL text) that each scoped view reads at query time
    // via `current_setting`, (3) create all the temp views, and only then
    // (4) flip the transaction to READ ONLY before handing the client to the
    // caller's `fn`, so the LLM-issued query itself can never write.
    //
    // `CREATE OR REPLACE TEMP VIEW` (not plain `CREATE TEMP VIEW`) because
    // `reportingPool` is a connection pool: the underlying session — and any
    // temp views already defined on it from a previous request — outlives a
    // single transaction, so a later request can be handed a connection that
    // already has these views defined from an earlier caller.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.reporting_farm_ids', $1, true)", [farmIds.join(",")]);

    for (const view of SCOPED_VIEWS_BY_FARM) {
      if (admin) {
        await client.query(`CREATE OR REPLACE TEMP VIEW ${view.name} AS SELECT * FROM ${view.source}`);
      } else {
        await client.query(
          `CREATE OR REPLACE TEMP VIEW ${view.name} AS SELECT * FROM ${view.source} ` +
            `WHERE ${view.farmColumn} = ANY(string_to_array(nullif(current_setting('app.reporting_farm_ids', true), ''), ',')::uuid[])`
        );
      }
    }
    for (const view of GLOBAL_CATALOG_VIEWS) {
      await client.query(`CREATE OR REPLACE TEMP VIEW ${view.name} AS SELECT * FROM ${view.source}`);
    }

    await client.query("SET TRANSACTION READ ONLY");

    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
