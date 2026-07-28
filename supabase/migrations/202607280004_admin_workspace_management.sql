-- Admin workspace management: global per-participant discount cap + enforce in order creation.
alter table public.event_settings
  add column if not exists max_discount_items_per_participant int not null default 6 check (max_discount_items_per_participant > 0);

create or replace function public.create_order_transaction(
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
  existing_discounts int;
begin
  if p_regular_amount < 0 then raise exception using errcode = '22023', message = 'INVALID_AMOUNT'; end if;
  if p_code !~ '^B[1-9][0-9]*-[0-9]{3}$' then raise exception using errcode = '22023', message = 'INVALID_ORDER_CODE'; end if;
  if exists (select 1 from public.orders where code = upper(trim(p_code))) then raise exception using errcode = 'P0005', message = 'ORDER_CODE_USED'; end if;
  select * into booth_row from public.booths where id = p_booth_id and is_active = true for update;
  if not found then raise exception using errcode = 'P0003', message = 'BOOTH_NOT_FOUND'; end if;
  select * into settings_row from public.event_settings where id = 1;
  if p_has_discount_item then
    select count(*) into existing_discounts from public.orders
      where participant_id = p_participant_id and has_discount_item = true and status <> 'void';
    if existing_discounts >= settings_row.max_discount_items_per_participant then
      raise exception using errcode = 'P0006', message = 'DISCOUNT_QUOTA_REACHED';
    end if;
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
  raise exception using errcode = '23505', message = 'DISCOUNT_ALREADY_TAKEN';
end;
$$;

revoke all on function public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid) from public;
grant execute on function public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid) to service_role;
