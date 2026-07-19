insert into public.role (name) values ('manager'), ('admin')
on conflict (name) do nothing;
