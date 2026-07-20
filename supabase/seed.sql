insert into public.role (name) values ('manager'), ('admin')
on conflict (name) do nothing;

insert into public.product (name, default_dose_unit, default_withdrawal_days)
values ('Ivermectina 1%', 'ml', 21)
on conflict (name) do nothing;

-- E2E test fixtures. Local dev only — auth.users/auth.identities inserts like
-- this must never run against a deployed project; there you'd use the Auth
-- Admin API instead. pgcrypto (enabled in the first schema migration)
-- provides crypt()/gen_salt('bf'), the same bcrypt scheme GoTrue itself uses,
-- so these users can log in for real through supabase.auth.signInWithPassword.
do $$
declare
  v_manager_one_farm_id uuid := gen_random_uuid();
  v_manager_no_farm_id uuid := gen_random_uuid();
  v_admin_id uuid := gen_random_uuid();
  v_farm_one_id uuid := gen_random_uuid();
  v_farm_two_id uuid := gen_random_uuid();
  v_manager_role_id uuid;
  v_admin_role_id uuid;
begin
  select id into v_manager_role_id from public.role where name = 'manager';
  select id into v_admin_role_id from public.role where name = 'admin';

  insert into public.farm (id, name) values
    (v_farm_one_id, 'Campo Test Uno'),
    (v_farm_two_id, 'Campo Test Dos');

  -- confirmation_token/recovery_token/email_change_token_new/email_change have
  -- no column default (NULL unless set) but GoTrue's Go struct scans them as
  -- plain strings, not sql.NullString — leaving them NULL makes
  -- signInWithPassword fail with "500: Database error querying schema" /
  -- "converting NULL to string is unsupported". Explicit '' is required for
  -- any row inserted directly into auth.users outside of GoTrue itself.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values
    (v_manager_one_farm_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'e2e.manager.one.farm@test.local', crypt('e2e-test-password', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(),
     '', '', '', ''),
    (v_manager_no_farm_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'e2e.manager.no.farm@test.local', crypt('e2e-test-password', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(),
     '', '', '', ''),
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'e2e.admin@test.local', crypt('e2e-test-password', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(),
     '', '', '', '');

  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values
    (v_manager_one_farm_id, v_manager_one_farm_id,
     format('{"sub": "%s", "email": "e2e.manager.one.farm@test.local"}', v_manager_one_farm_id)::jsonb,
     'email', v_manager_one_farm_id, now(), now(), now()),
    (v_manager_no_farm_id, v_manager_no_farm_id,
     format('{"sub": "%s", "email": "e2e.manager.no.farm@test.local"}', v_manager_no_farm_id)::jsonb,
     'email', v_manager_no_farm_id, now(), now(), now()),
    (v_admin_id, v_admin_id,
     format('{"sub": "%s", "email": "e2e.admin@test.local"}', v_admin_id)::jsonb,
     'email', v_admin_id, now(), now(), now());

  insert into public.user_account (id, name, email, role_id) values
    (v_manager_one_farm_id, 'E2E Manager (un campo)', 'e2e.manager.one.farm@test.local', v_manager_role_id),
    (v_manager_no_farm_id, 'E2E Manager (sin campo)', 'e2e.manager.no.farm@test.local', v_manager_role_id),
    (v_admin_id, 'E2E Admin', 'e2e.admin@test.local', v_admin_role_id);

  insert into public.user_farm (user_id, farm_id) values (v_manager_one_farm_id, v_farm_one_id);
end $$;
