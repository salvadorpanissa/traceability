create table public.farm (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dicose_code text,
  ruc text
);

create table public.role (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.user_account (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role_id uuid not null references public.role(id)
);

create table public.user_farm (
  user_id uuid not null references public.user_account(id) on delete cascade,
  farm_id uuid not null references public.farm(id) on delete cascade,
  primary key (user_id, farm_id)
);
