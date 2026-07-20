create or replace function public.confirm_health_batch(
  p_farm_id uuid,
  p_product_id uuid,
  p_dose numeric,
  p_dose_unit text,
  p_route text,
  p_withdrawal_days int,
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
  v_event_id uuid;
  v_row jsonb;
begin
  v_animal_count := coalesce(array_length(p_existing_animal_ids, 1), 0) + jsonb_array_length(p_new_animals);

  insert into public.batch_operation (event_type, farm_id, animal_count, created_by)
  values ('health', p_farm_id, v_animal_count, auth.uid())
  returning id into v_batch_id;

  foreach v_animal_id in array p_existing_animal_ids
  loop
    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('health', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_health (event_id, product_id, dose, dose_unit, route, withdrawal_days)
    values (v_event_id, p_product_id, p_dose, p_dose_unit, p_route, p_withdrawal_days);
  end loop;

  -- Same RETURNING/RLS pitfall as confirm_transfer_batch (Task 2): generate
  -- the id explicitly and insert without RETURNING, since animal_select
  -- can't yet see a row with zero events.
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

    -- Internal self-transfer: places the new animal in the operating farm.
    -- Not a real traslado the user chose, and never carries a paddock.
    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('transfer', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_transfer (event_id, origin_farm_id, destination_farm_id)
    values (v_event_id, p_farm_id, p_farm_id);

    if (v_row->>'category_id') is not null then
      insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
      values ('recategorize', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
      returning id into v_event_id;
      insert into public.event_recategorize (event_id, old_category_id, new_category_id)
      values (v_event_id, (v_row->>'category_id')::uuid, (v_row->>'category_id')::uuid);
    end if;

    insert into public.event (event_type, event_date, animal_id, farm_id, batch_operation_id, created_by)
    values ('health', p_event_date, v_animal_id, p_farm_id, v_batch_id, auth.uid())
    returning id into v_event_id;
    insert into public.event_health (event_id, product_id, dose, dose_unit, route, withdrawal_days)
    values (v_event_id, p_product_id, p_dose, p_dose_unit, p_route, p_withdrawal_days);
  end loop;

  return v_batch_id;
end;
$$;

grant execute on function public.confirm_health_batch(uuid, uuid, numeric, text, text, int, date, uuid[], jsonb) to authenticated;
