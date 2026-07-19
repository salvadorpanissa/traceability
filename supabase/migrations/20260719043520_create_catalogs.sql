create table public.category (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0
);

create table public.product (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_dose_unit text,
  default_withdrawal_days int
);
