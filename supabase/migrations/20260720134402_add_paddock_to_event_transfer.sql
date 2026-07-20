alter table public.event_transfer
  add column origin_paddock_id uuid references public.paddock(id),
  add column destination_paddock_id uuid references public.paddock(id);
