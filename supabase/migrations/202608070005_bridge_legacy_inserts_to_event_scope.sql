-- Bridge kompatibilitas: RPC lama belum mengisi event_id.
-- MEASURED sebelum migrasi: create_order_transaction gagal 23502 pada
-- orders.event_id. Trigger mengisi scope dari booth/participant; FK komposit
-- tetap menjadi penjaga akhir. Hapus bridge hanya setelah semua RPC eksplisit.

create or replace function public.assign_order_event_id()
returns trigger language plpgsql set search_path=public as $$
declare v_booth_event uuid; v_participant_event uuid;
begin
  select event_id into v_booth_event from public.booths where id=new.booth_id;
  select event_id into v_participant_event from public.participants where id=new.participant_id;
  if v_booth_event is null then raise exception using errcode='P0003',message='BOOTH_NOT_FOUND'; end if;
  if v_participant_event is null then raise exception using errcode='P0002',message='PARTICIPANT_NOT_FOUND'; end if;
  if v_booth_event <> v_participant_event then raise exception using errcode='23503',message='EVENT_SCOPE_MISMATCH'; end if;
  if new.event_id is not null and new.event_id <> v_booth_event then raise exception using errcode='23503',message='EVENT_SCOPE_MISMATCH'; end if;
  new.event_id := v_booth_event;
  return new;
end $$;

drop trigger if exists orders_assign_event_id on public.orders;
create trigger orders_assign_event_id before insert on public.orders
for each row execute function public.assign_order_event_id();

create or replace function public.assign_claim_event_id()
returns trigger language plpgsql set search_path=public as $$
declare v_order_event uuid; v_offer_event uuid;
begin
  select event_id into v_order_event from public.orders where id=new.order_id;
  select event_id into v_offer_event from public.special_offers where id=new.offer_id;
  if v_order_event is null or v_offer_event is null or v_order_event <> v_offer_event then
    raise exception using errcode='23503',message='EVENT_SCOPE_MISMATCH';
  end if;
  if new.event_id is not null and new.event_id <> v_order_event then raise exception using errcode='23503',message='EVENT_SCOPE_MISMATCH'; end if;
  new.event_id := v_order_event;
  return new;
end $$;

drop trigger if exists order_special_items_assign_event_id on public.order_special_items;
create trigger order_special_items_assign_event_id before insert on public.order_special_items
for each row execute function public.assign_claim_event_id();

revoke all on function public.assign_order_event_id() from public,anon,authenticated;
revoke all on function public.assign_claim_event_id() from public,anon,authenticated;
