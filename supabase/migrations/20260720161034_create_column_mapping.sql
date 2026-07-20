-- Remembers which meaning ("Caravana", "Fecha", "Categoría", "Sexo",
-- "Propietario", "Producto", "Ignorar") the user assigned to each column of
-- an uploaded Excel, keyed by the exact header signature (see
-- computeHeaderSignature in web/lib/activities/column-mapping.ts) so the
-- next upload with the same headers/order applies it automatically. Shared
-- across the whole account (spec: "compartido para toda la cuenta — no por
-- establecimiento ni por usuario"), not scoped by activity type: the same
-- signature can't realistically appear for both traslado and sanidad
-- exports (their source readers produce structurally different columns),
-- and even if it did, an activity's resolver simply ignores meanings that
-- don't apply to it (e.g. "product" is inert outside sanidad).
create table public.column_mapping (
  id uuid primary key default gen_random_uuid(),
  header_signature text not null unique,
  mapping jsonb not null,
  created_at timestamptz not null default now()
);

-- No delete grant/policy: mappings are only ever created or corrected
-- (upserted), never removed, by design — YAGNI until a real need shows up.
grant select, insert, update on public.column_mapping to authenticated;

alter table public.column_mapping enable row level security;

-- Not sensitive data (just a header-name-to-meaning dictionary) and
-- deliberately not admin-gated: any manager uploading a new file format is
-- the one who maps it by hand, per spec.
create policy column_mapping_select on public.column_mapping for select to authenticated using (true);
create policy column_mapping_write on public.column_mapping for all to authenticated using (true) with check (true);
