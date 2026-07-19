-- Base table grants ------------------------------------------------------
-- RLS policies only take effect once the role already holds the underlying
-- SQL privilege; without a GRANT, Postgres denies access before policies
-- are even consulted. Immutable/append-only tables (animal, event, and
-- event's children) intentionally get no UPDATE/DELETE grant at all, as a
-- privilege-level backstop to the "no update/delete policy" rule below.

grant select, insert, update, delete on
  public.role, public.category, public.product, public.farm,
  public.user_account, public.user_farm
  to authenticated;

grant select, insert on
  public.animal, public.animal_tag_history,
  public.batch_operation, public.event,
  public.event_transfer, public.event_health, public.event_retag,
  public.event_recategorize, public.event_sale, public.event_death
  to authenticated;

-- animal_current_state_mv itself is intentionally NOT granted to
-- authenticated. Postgres cannot enable RLS on a materialized view, so
-- access control for derived state is enforced entirely by the
-- security-invoker wrapper view created below, which is the only thing
-- authenticated ever gets to query.

-- Helper functions -----------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.user_account ua
    join public.role r on r.id = ua.role_id
    where ua.id = auth.uid() and r.name = 'admin'
  );
$$;

create or replace function public.user_farm_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select farm_id from public.user_farm where user_id = auth.uid();
$$;

-- Catalogs: readable by any authenticated user, writable by admin only --

alter table public.role enable row level security;
create policy role_select on public.role for select to authenticated using (true);
create policy role_write on public.role for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.category enable row level security;
create policy category_select on public.category for select to authenticated using (true);
create policy category_write on public.category for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.product enable row level security;
create policy product_select on public.product for select to authenticated using (true);
create policy product_write on public.product for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- farm -------------------------------------------------------------------

alter table public.farm enable row level security;

create policy farm_select on public.farm for select to authenticated using (
  public.is_admin() or id in (select public.user_farm_ids())
);
create policy farm_write on public.farm for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- user_account / user_farm ------------------------------------------------

alter table public.user_account enable row level security;
create policy user_account_select on public.user_account for select to authenticated using (
  public.is_admin() or id = auth.uid()
);
create policy user_account_write on public.user_account for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.user_farm enable row level security;
create policy user_farm_select on public.user_farm for select to authenticated using (
  public.is_admin() or user_id = auth.uid()
);
create policy user_farm_write on public.user_farm for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- animal_current_state_mv cannot have RLS (materialized views don't support
-- it), so the farm-scoping filter is applied directly in this wrapper
-- view's WHERE clause instead of via a policy. Deliberately NOT
-- security_invoker: the view must run with its owner's (postgres)
-- privileges so it can read animal_current_state_mv on the caller's
-- behalf, since authenticated is never granted access to the mv directly
-- - only to this filtered view. Making it security_invoker would require
-- granting authenticated raw access to the mv, which would let any client
-- query it directly and bypass the filter entirely.
-- Created here (before the policies below) because they reference it.
create view public.animal_current_state
as
select *
from public.animal_current_state_mv
where public.is_admin() or current_farm_id in (select public.user_farm_ids());

grant select on public.animal_current_state to authenticated;

-- animal / animal_tag_history (scoped via animal_current_state) ----------

alter table public.animal enable row level security;
create policy animal_select on public.animal for select to authenticated using (
  public.is_admin()
  or exists (
    select 1 from public.animal_current_state acs
    where acs.animal_id = animal.id and acs.current_farm_id in (select public.user_farm_ids())
  )
);
create policy animal_insert on public.animal for insert to authenticated with check (
  exists (select 1 from public.user_account where id = auth.uid())
);

alter table public.animal_tag_history enable row level security;
create policy animal_tag_history_select on public.animal_tag_history for select to authenticated using (
  public.is_admin()
  or exists (
    select 1 from public.animal_current_state acs
    where acs.animal_id = animal_tag_history.animal_id and acs.current_farm_id in (select public.user_farm_ids())
  )
);
create policy animal_tag_history_insert on public.animal_tag_history for insert to authenticated with check (
  exists (select 1 from public.user_account where id = auth.uid())
);

-- batch_operation ----------------------------------------------------------

alter table public.batch_operation enable row level security;
create policy batch_operation_select on public.batch_operation for select to authenticated using (
  public.is_admin() or farm_id in (select public.user_farm_ids())
);
create policy batch_operation_insert on public.batch_operation for insert to authenticated with check (
  public.is_admin() or farm_id in (select public.user_farm_ids())
);

-- event ----------------------------------------------------------------

alter table public.event enable row level security;
create policy event_select on public.event for select to authenticated using (
  public.is_admin() or farm_id in (select public.user_farm_ids())
);
create policy event_insert on public.event for insert to authenticated with check (
  public.is_admin() or farm_id in (select public.user_farm_ids())
);

-- event_transfer: only admin may create a cross-farm transfer -----------

alter table public.event_transfer enable row level security;
create policy event_transfer_select on public.event_transfer for select to authenticated using (
  public.is_admin()
  or exists (
    select 1 from public.event e
    where e.id = event_transfer.event_id and e.farm_id in (select public.user_farm_ids())
  )
);
create policy event_transfer_insert on public.event_transfer for insert to authenticated with check (
  public.is_admin()
  or (
    origin_farm_id = destination_farm_id
    and origin_farm_id in (select public.user_farm_ids())
  )
);

-- remaining event children: scoped via parent event's farm_id -----------

alter table public.event_health enable row level security;
create policy event_health_select on public.event_health for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.event e where e.id = event_health.event_id and e.farm_id in (select public.user_farm_ids()))
);
create policy event_health_insert on public.event_health for insert to authenticated with check (
  public.is_admin()
  or exists (select 1 from public.event e where e.id = event_health.event_id and e.farm_id in (select public.user_farm_ids()))
);

alter table public.event_retag enable row level security;
create policy event_retag_select on public.event_retag for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.event e where e.id = event_retag.event_id and e.farm_id in (select public.user_farm_ids()))
);
create policy event_retag_insert on public.event_retag for insert to authenticated with check (
  public.is_admin()
  or exists (select 1 from public.event e where e.id = event_retag.event_id and e.farm_id in (select public.user_farm_ids()))
);

alter table public.event_recategorize enable row level security;
create policy event_recategorize_select on public.event_recategorize for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.event e where e.id = event_recategorize.event_id and e.farm_id in (select public.user_farm_ids()))
);
create policy event_recategorize_insert on public.event_recategorize for insert to authenticated with check (
  public.is_admin()
  or exists (select 1 from public.event e where e.id = event_recategorize.event_id and e.farm_id in (select public.user_farm_ids()))
);

alter table public.event_sale enable row level security;
create policy event_sale_select on public.event_sale for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.event e where e.id = event_sale.event_id and e.farm_id in (select public.user_farm_ids()))
);
create policy event_sale_insert on public.event_sale for insert to authenticated with check (
  public.is_admin()
  or exists (select 1 from public.event e where e.id = event_sale.event_id and e.farm_id in (select public.user_farm_ids()))
);

alter table public.event_death enable row level security;
create policy event_death_select on public.event_death for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.event e where e.id = event_death.event_id and e.farm_id in (select public.user_farm_ids()))
);
create policy event_death_insert on public.event_death for insert to authenticated with check (
  public.is_admin()
  or exists (select 1 from public.event e where e.id = event_death.event_id and e.farm_id in (select public.user_farm_ids()))
);
