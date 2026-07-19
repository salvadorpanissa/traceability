create table public.animal (
  id uuid primary key default gen_random_uuid(),
  birth_date date,
  created_at timestamptz not null default now()
);

create table public.animal_tag_history (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animal(id) on delete cascade,
  tag text not null,
  valid_from timestamptz not null default now()
);

create index animal_tag_history_animal_id_idx on public.animal_tag_history(animal_id);
create index animal_tag_history_tag_idx on public.animal_tag_history(tag);
