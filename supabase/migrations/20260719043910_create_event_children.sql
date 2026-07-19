create table public.event_transfer (
  event_id uuid primary key references public.event(id) on delete cascade,
  origin_farm_id uuid not null references public.farm(id),
  destination_farm_id uuid not null references public.farm(id),
  guide_number text
);

create table public.event_health (
  event_id uuid primary key references public.event(id) on delete cascade,
  product_id uuid not null references public.product(id),
  dose numeric not null,
  dose_unit text not null,
  route text not null,
  withdrawal_days int,
  notes text
);

create table public.event_retag (
  event_id uuid primary key references public.event(id) on delete cascade,
  old_tag text not null,
  new_tag text not null
);

create table public.event_recategorize (
  event_id uuid primary key references public.event(id) on delete cascade,
  old_category_id uuid not null references public.category(id),
  new_category_id uuid not null references public.category(id)
);

create table public.event_sale (
  event_id uuid primary key references public.event(id) on delete cascade,
  buyer text,
  price numeric,
  weight_kg numeric
);

create table public.event_death (
  event_id uuid primary key references public.event(id) on delete cascade,
  cause text
);
