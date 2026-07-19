create table public.batch_operation (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  farm_id uuid not null references public.farm(id),
  selection_criteria jsonb not null default '{}'::jsonb,
  animal_count int not null,
  created_by uuid not null references public.user_account(id),
  created_at timestamptz not null default now()
);

create table public.event (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in ('transfer', 'health', 'retag', 'recategorize', 'sale', 'death', 'void')
  ),
  event_date date not null,
  animal_id uuid not null references public.animal(id),
  farm_id uuid not null references public.farm(id),
  batch_operation_id uuid not null references public.batch_operation(id),
  created_by uuid not null references public.user_account(id),
  created_at timestamptz not null default now(),
  voids_event_id uuid references public.event(id),
  constraint event_voids_only_when_void check (
    (event_type = 'void' and voids_event_id is not null)
    or (event_type <> 'void' and voids_event_id is null)
  )
);

create index event_animal_id_idx on public.event(animal_id);
create index event_batch_operation_id_idx on public.event(batch_operation_id);
create index event_voids_event_id_idx on public.event(voids_event_id) where voids_event_id is not null;
