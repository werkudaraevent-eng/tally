-- Revert discount rule back to per-booth (spec BR-01): one discount item per participant PER BOOTH.
drop index if exists public.uniq_discount_per_participant;
create unique index if not exists uniq_discount_per_booth
  on public.orders (participant_id, booth_id)
  where has_discount_item = true and status <> 'void';

-- Restore per-booth availability check in participant lookup.
create or replace function public.get_participant_by_qr(p_qr_code text, p_booth_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  participant_row public.participants;
  booth_row public.booths;
  existing_orders jsonb;
  discount_order public.orders;
  booth_progress int;
  active_booths int;
begin
  select * into participant_row from public.participants where qr_code = trim(p_qr_code);
  if not found then raise exception using errcode = 'P0002', message = 'PARTICIPANT_NOT_FOUND'; end if;
  select * into booth_row from public.booths where id = p_booth_id and is_active = true;
  if not found then raise exception using errcode = 'P0003', message = 'BOOTH_NOT_FOUND'; end if;
  select jsonb_agg(to_jsonb(o) order by o.created_at desc) into existing_orders from public.orders o where o.participant_id = participant_row.id and o.booth_id = p_booth_id;
  select * into discount_order from public.orders where participant_id = participant_row.id and booth_id = p_booth_id and has_discount_item = true and status <> 'void' order by created_at desc limit 1;
  select count(*) into booth_progress from public.orders where participant_id = participant_row.id and status in ('paid', 'handed_over') and has_discount_item = true;
  select count(*) into active_booths from public.booths where is_active = true;
  return jsonb_build_object(
    'participant', jsonb_build_object('id', participant_row.id, 'qr_code', participant_row.qr_code, 'name', participant_row.name, 'company', participant_row.company, 'title', participant_row.title, 'photo_url', participant_row.photo_url, 'allow_name_display', participant_row.allow_name_display),
    'discount_available', discount_order.id is null and (booth_row.discount_item_stock is null or booth_row.discount_item_stock > 0),
    'discount_taken_at', discount_order.created_at,
    'existing_orders_at_this_booth', coalesce(existing_orders, '[]'::jsonb),
    'progress', jsonb_build_object('visited', booth_progress, 'total', active_booths),
    'booth', jsonb_build_object('id', booth_row.id, 'code', booth_row.code, 'name', booth_row.name, 'discount_item_name', booth_row.discount_item_name, 'discount_item_price', booth_row.discount_item_price, 'discount_item_stock', booth_row.discount_item_stock)
  );
end;
$$;

-- Fix create_order_transaction: a duplicate ORDER CODE must not be reported as DISCOUNT_ALREADY_TAKEN.
-- The old duplicate-code check raised errcode 23505, which the generic unique_violation handler
-- then re-raised as DISCOUNT_ALREADY_TAKEN. Use a distinct errcode so the two conflicts stay separate.
drop function if exists public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid);
create function public.create_order_transaction(
  p_code text,
  p_participant_id uuid,
  p_booth_id integer,
  p_has_discount_item boolean,
  p_regular_amount integer,
  p_note text,
  p_created_by uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  booth_row public.booths;
  settings_row public.event_settings;
  new_order public.orders;
  discount_price int := 0;
begin
  if p_regular_amount < 0 then raise exception using errcode = '22023', message = 'INVALID_AMOUNT'; end if;
  if p_code !~ '^B[1-9][0-9]*-[0-9]{3}$' then raise exception using errcode = '22023', message = 'INVALID_ORDER_CODE'; end if;
  if exists (select 1 from public.orders where code = upper(trim(p_code))) then raise exception using errcode = 'P0005', message = 'ORDER_CODE_USED'; end if;
  select * into booth_row from public.booths where id = p_booth_id and is_active = true for update;
  if not found then raise exception using errcode = 'P0003', message = 'BOOTH_NOT_FOUND'; end if;
  select * into settings_row from public.event_settings where id = 1;
  if p_has_discount_item then
    if booth_row.discount_item_stock is not null then
      if booth_row.discount_item_stock <= 0 then raise exception using errcode = 'P0004', message = 'DISCOUNT_OUT_OF_STOCK'; end if;
      update public.booths set discount_item_stock = discount_item_stock - 1 where id = p_booth_id;
    end if;
    discount_price := 1;
  end if;
  insert into public.orders (code, participant_id, booth_id, has_discount_item, regular_amount, total_amount, pickup_mode, note, created_by)
  values (upper(trim(p_code)), p_participant_id, p_booth_id, p_has_discount_item, p_regular_amount, p_regular_amount + discount_price, settings_row.pickup_mode, nullif(trim(p_note), ''), p_created_by)
  returning * into new_order;
  insert into public.audit_logs (order_id, user_id, action, payload) values (new_order.id, p_created_by, 'create', jsonb_build_object('code', new_order.code, 'pickup_mode', new_order.pickup_mode, 'has_discount_item', new_order.has_discount_item));
  return new_order;
exception when unique_violation then
  -- Only the discount partial unique index can trigger this now (order code is pre-checked with P0005).
  raise exception using errcode = '23505', message = 'DISCOUNT_ALREADY_TAKEN';
end;
$$;

revoke all on function public.get_participant_by_qr(text, integer) from public;
grant execute on function public.get_participant_by_qr(text, integer) to service_role;
revoke all on function public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid) from public;
grant execute on function public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid) to service_role;
