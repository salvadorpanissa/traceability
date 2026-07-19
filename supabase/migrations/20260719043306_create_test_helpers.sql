create schema if not exists tests;

create or replace function tests.create_supabase_user(
  identifier text,
  user_email text default null,
  user_role text default 'manager'
)
returns uuid
language plpgsql
as $$
declare
  new_user_id uuid := gen_random_uuid();
  resolved_role_id uuid;
  resolved_email text := coalesce(user_email, identifier || '@test.local');
begin
  insert into auth.users (id, email)
  values (new_user_id, resolved_email)
  on conflict (id) do nothing;

  select id into resolved_role_id from public.role where name = user_role;

  insert into public.user_account (id, name, email, role_id)
  values (new_user_id, identifier, resolved_email, resolved_role_id);

  return new_user_id;
end;
$$;

-- security definer: called from authenticate_as() after the session role
-- may already have been switched to something restricted (e.g. anon via
-- clear_authentication()), which would otherwise lack SELECT on
-- user_account once RLS grants land in a later migration.
create or replace function tests.get_supabase_user(identifier text)
returns uuid
language sql
security definer
stable
as $$
  select id from public.user_account where name = identifier;
$$;

create or replace function tests.authenticate_as(
  identifier text,
  user_role text default 'authenticated'
)
returns void
language plpgsql
as $$
declare
  target_user_id uuid := tests.get_supabase_user(identifier);
begin
  if target_user_id is null then
    raise exception 'test user "%" not found - call tests.create_supabase_user(''%'') first', identifier, identifier;
  end if;
  perform set_config('role', user_role, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', target_user_id::text, 'role', user_role)::text,
    true
  );
end;
$$;

create or replace function tests.clear_authentication()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- authenticate_as() switches the session role away from postgres, so every
-- role it can switch into needs standing access to call tests.* functions
-- (including clear_authentication() itself, called while already switched).
grant usage on schema tests to authenticated, anon, service_role;
grant execute on all functions in schema tests to authenticated, anon, service_role;
alter default privileges in schema tests grant execute on functions to authenticated, anon, service_role;
