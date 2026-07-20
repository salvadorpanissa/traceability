create or replace function public.confirm_transfer_batch(
  p_farm_id uuid,
  p_destination_farm_id uuid,
  p_destination_paddock_id uuid,
  p_event_date date,
  p_existing_animal_ids uuid[],
  p_new_animals jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_batch_id uuid;
  v_animal_count int;
  v_animal_id uuid;
  v_origin_farm_id uuid;
  v_origin_paddock_id uuid;
  v_event_id uuid;
  v_row jsonb;
begin
  if p_destination_paddock_id is not null then
    if not exists (
      select 1 from public.paddock
      where id = p_destination_paddock_id and farm_id = p_destination_farm_id
    ) then
      raise exception 'El potrero destino no pertenece al establecimiento destino.';
    end if;
  end if;

  v_animal_count := coalesce(array_length(p_existing_animal_ids, 1), 0) + jsonb_array_length(p_new_animals);

  insert into public.batch_operation (event_type, farm_id, animal_count, created_by)
  values ('transfer', p_farm_id, v_animal_count, auth.uid())
  returning id into v_batch_id;

  -- Existing animals: origin is looked up server-side from their real
  -- current placement, never trusted from the client, to avoid staleness
  -- between the validation preview and this confirmation call.
  foreach v_animal_id in array p_existing_animal_ids
  loop
    select current_farm_id, current_paddock_id into v_origin_farm_id, v_origin_paddock_id
    from public.animal_current_state
    where animal_id = v_animal_id;

    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('transfer', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;

    insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id, origin_paddock_id, destination_paddock_id)
    values (v_event_id, v_origin_farm_id, p_destination_farm_id, v_origin_paddock_id, p_destination_paddock_id);
  end loop;

  -- New animals: create the animal, then a self-retag (establishes its
  -- initial current_tag), the real transfer to the destination, and an
  -- optional self-recategorize if the Excel row carried a category.
  --
  -- The id is generated here and inserted explicitly (no RETURNING):
  -- Postgres re-checks INSERT ... RETURNING output against the table's
  -- SELECT policy, and animal_select requires an existing
  -- animal_current_state row scoped to the caller's farm - which a
  -- brand-new animal doesn't have until its transfer event below commits
  -- and the derived-state view refreshes. RETURNING would therefore raise
  -- "new row violates row-level security policy" even though the INSERT's
  -- own WITH CHECK passes.
  for v_row in select * from jsonb_array_elements(p_new_animals)
  loop
    v_animal_id := gen_random_uuid();
    insert into public.animal (id) values (v_animal_id);
    insert into public.animal_tag_history (animal_id, tag) values (v_animal_id, v_row->>'tag');

    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('retag', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_retag (event_id, old_tag, new_tag)
    values (v_event_id, v_row->>'tag', v_row->>'tag');

    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('transfer', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id, destination_paddock_id)
    values (v_event_id, p_farm_id, p_destination_farm_id, p_destination_paddock_id);

    if (v_row->>'category_id') is not null then
      insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
      values ('recategorize', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
      returning id into v_event_id;
      insert into public.event_recategorize (event_id, old_category_id, new_category_id)
      values (v_event_id, (v_row->>'category_id')::uuid, (v_row->>'category_id')::uuid);
    end if;
  end loop;

  return v_batch_id;
end;
$$;

grant execute on function public.confirm_transfer_batch(uuid, uuid, uuid, date, uuid[], jsonb) to authenticated;
