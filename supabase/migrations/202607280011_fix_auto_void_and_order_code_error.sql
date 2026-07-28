-- Dua perbaikan konkurensi menjelang hari-H.
--
-- 1) auto_void_expired_orders(): batasi post-processing hanya pada baris yang
--    di-void oleh eksekusi ini. Versi sebelumnya memindai ulang berdasarkan
--    void_reason + voided_at > now() - interval '1 minute', sehingga dua
--    pemicu berdekatan (pg_cron dan endpoint manual /api/cron/auto-void)
--    dapat memproses order yang sama dua kali: stok diskon dikembalikan
--    dobel dan audit log duplikat.
--    `for update skip locked` mencegah dua eksekusi paralel memperebutkan
--    baris yang sama.
--
-- 2) create_order_transaction(): kembalikan penanganan unique_violation.
--    Tanpa ini, bentrok nomor stiker (orders_code_key) yang lolos dari cek
--    `exists` karena race akan muncul sebagai error 23505 mentah, lalu
--    diterjemahkan mapDatabaseError menjadi DISCOUNT_ALREADY_TAKEN sehingga
--    admin booth melihat pesan yang menyesatkan.
--
-- Catatan: index uniq_discount_per_booth SENGAJA tidak dipasang kembali.
-- Index itu memaksa maksimal 1 item diskon per peserta per booth, sedangkan
-- admin harus bisa mengatur discount_limit_per_participant secara fleksibel
-- per booth. Perlindungan race untuk kuota diskon ditegakkan oleh
-- `select ... from booths ... for update` di create_order_transaction, yang
-- menyerialisasi seluruh pembuatan order pada booth yang sama.

create or replace function public.auto_void_expired_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  setting_minutes int;
  voided_count int := 0;
  item public.orders;
begin
  select pending_auto_void_minutes into setting_minutes from public.event_settings where id = 1;

  create temporary table if not exists _auto_voided (like public.orders) on commit drop;
  delete from _auto_voided;

  with candidates as (
    select id from public.orders
    where status = 'pending'
      and created_at <= now() - make_interval(mins => setting_minutes)
    for update skip locked
  ), expired as (
    update public.orders o
    set status = 'void',
        void_reason = 'Auto-void: melewati batas waktu pembayaran',
        voided_at = now()
    where o.id in (select id from candidates)
    returning o.*
  )
  insert into _auto_voided select * from expired;

  select count(*) into voided_count from _auto_voided;

  for item in select * from _auto_voided loop
    if item.has_discount_item then
      update public.booths
      set discount_item_stock = discount_item_stock + 1
      where id = item.booth_id and discount_item_stock is not null;
    end if;
    insert into public.audit_logs (order_id, action, payload)
    values (item.id, 'void', jsonb_build_object('reason', item.void_reason, 'automatic', true));
  end loop;

  return coalesce(voided_count, 0);
end;
$$;

revoke all on function public.auto_void_expired_orders() from public, anon, authenticated;
grant execute on function public.auto_void_expired_orders() to service_role;

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
  existing_here int;
begin
  if p_regular_amount < 0 then raise exception using errcode = '22023', message = 'INVALID_AMOUNT'; end if;
  if p_code !~ '^B[1-9][0-9]*-[0-9]{3}$' then raise exception using errcode = '22023', message = 'INVALID_ORDER_CODE'; end if;
  if exists (select 1 from public.orders where code = upper(trim(p_code))) then raise exception using errcode = 'P0005', message = 'ORDER_CODE_USED'; end if;

  -- Lock baris booth: menyerialisasi pembuatan order per booth sehingga
  -- perhitungan kuota diskon di bawah bebas dari race condition.
  select * into booth_row from public.booths where id = p_booth_id and is_active = true for update;
  if not found then raise exception using errcode = 'P0003', message = 'BOOTH_NOT_FOUND'; end if;
  select * into settings_row from public.event_settings where id = 1;

  if p_has_discount_item then
    if not booth_row.discount_enabled or booth_row.discount_limit_per_participant <= 0 then
      raise exception using errcode = 'P0006', message = 'DISCOUNT_NOT_OFFERED';
    end if;
    select count(*) into existing_here from public.orders
      where participant_id = p_participant_id and booth_id = p_booth_id and has_discount_item = true and status <> 'void';
    if existing_here >= booth_row.discount_limit_per_participant then
      raise exception using errcode = 'P0006', message = 'DISCOUNT_ALREADY_TAKEN';
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

  insert into public.audit_logs (order_id, user_id, action, payload)
  values (new_order.id, p_created_by, 'create', jsonb_build_object('code', new_order.code, 'pickup_mode', new_order.pickup_mode, 'has_discount_item', new_order.has_discount_item));
  return new_order;

exception when unique_violation then
  if sqlerrm like '%orders_code_key%' or sqlerrm like '%orders_code%' then
    raise exception using errcode = 'P0005', message = 'ORDER_CODE_USED';
  end if;
  raise exception using errcode = 'P0006', message = 'DISCOUNT_ALREADY_TAKEN';
end;
$$;

revoke all on function public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid) to service_role;
