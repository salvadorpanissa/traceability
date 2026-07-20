create table public.paddock (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farm(id),
  name text not null
);

grant select, insert, update, delete on public.paddock to authenticated;

alter table public.paddock enable row level security;

create policy paddock_select on public.paddock for select to authenticated using (
  public.is_admin() or farm_id in (select public.user_farm_ids())
);
create policy paddock_write on public.paddock for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
