-- Tahap 2+3: dual-write klaim + harga bebas + syarat akumulasi.
--
-- Digabung dalam SATU migrasi (satu transaksi) dengan sengaja. Kalau constraint
-- ditukar lebih dulu di migrasi terpisah, ada jendela di mana
-- create_order_transaction belum menulis order_special_items sehingga setiap order
-- berdiskon ditolak database dan booth berhenti bisa membuat order.
--
-- Tiga hal yang dibuka tahap ini:
-- 1. Harga item spesial bebas (tidak lagi dipaku Rp 1 oleh CHECK).
-- 2. Penawaran global: satu kuota untuk seluruh acara, ditebus di booth mana saja.
-- 3. Syarat akumulasi transaksi peserta (mis. minimal Rp 500.000).

-- ---------------------------------------------------------------------------
-- 1. Ganti CHECK statis dengan constraint trigger.
-- ---------------------------------------------------------------------------
-- Postgres menolak subquery di CHECK constraint (SQLSTATE 0A000), jadi aturan
-- "total = regular + jumlah harga klaim" tidak bisa jadi CHECK. Dipakai constraint
-- trigger DEFERRABLE INITIALLY DEFERRED: baris orders selalu masuk lebih dulu,
-- baris klaimnya menyusul, jadi validasi harus menunggu COMMIT.

alter table public.orders drop constraint if exists total_matches_items;

create or replace function public.validate_order_total()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  expected int;
  order_row public.orders;
begin
  select * into order_row from public.orders where id = coalesce(new.id, old.id);
  -- Order sudah dihapus di transaksi yang sama: tidak ada yang perlu divalidasi.
  if not found then return null; end if;

  select order_row.regular_amount + coalesce(sum(i.price_at_claim), 0) into expected
  from public.order_special_items i where i.order_id = order_row.id;

  if order_row.total_amount <> expected then
    raise exception using errcode = '23514',
      message = 'ORDER_TOTAL_MISMATCH: total_amount ' || order_row.total_amount || ' <> regular ' || order_row.regular_amount || ' + item spesial ' || (expected - order_row.regular_amount);
  end if;
  return null;
end;
$function$;

drop trigger if exists orders_validate_total on public.orders;
create constraint trigger orders_validate_total
  after insert or update of total_amount, regular_amount on public.orders
  deferrable initially deferred
  for each row execute function public.validate_order_total();

-- Klaim yang ditambah/dihapus juga harus menjaga total tetap konsisten.
create or replace function public.validate_order_total_from_claim()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  expected int;
  order_row public.orders;
begin
  select * into order_row from public.orders where id = coalesce(new.order_id, old.order_id);
  if not found then return null; end if;

  select order_row.regular_amount + coalesce(sum(i.price_at_claim), 0) into expected
  from public.order_special_items i where i.order_id = order_row.id;

  if order_row.total_amount <> expected then
    raise exception using errcode = '23514',
      message = 'ORDER_TOTAL_MISMATCH: total_amount ' || order_row.total_amount || ' <> regular ' || order_row.regular_amount || ' + item spesial ' || (expected - order_row.regular_amount);
  end if;
  return null;
end;
$function$;

drop trigger if exists order_special_items_validate_total on public.order_special_items;
create constraint trigger order_special_items_validate_total
  after insert or update or delete on public.order_special_items
  deferrable initially deferred
  for each row execute function public.validate_order_total_from_claim();

-- ---------------------------------------------------------------------------
-- 2. Akumulasi belanja peserta.
-- ---------------------------------------------------------------------------
-- Dasar yang dipakai untuk syarat min_accumulated_amount, dan juga untuk
-- leaderboard, supaya keduanya tidak pernah berbeda definisi.
-- Hanya order paid/handed_over (keputusan klien), dan item spesial hanya dihitung
-- bila klaimnya bertanda counts_toward_leaderboard.
create or replace function public.participant_accumulated_amount(p_participant_id uuid)
returns bigint
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(sum(o.regular_amount), 0)::bigint
       + coalesce((
           select sum(i.price_at_claim)
           from public.order_special_items i
           join public.orders o2 on o2.id = i.order_id
           where o2.participant_id = p_participant_id
             and o2.status in ('paid', 'handed_over')
             and i.counts_toward_leaderboard
         ), 0)::bigint
  from public.orders o
  where o.participant_id = p_participant_id
    and o.status in ('paid', 'handed_over');
$function$;

-- Daftar penawaran yang berlaku di satu booth untuk satu peserta, lengkap dengan
-- alasan kalau belum memenuhi syarat. Dipakai layar booth agar staf tidak menebak.
create or replace function public.get_available_offers(p_participant_id uuid, p_booth_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  accumulated bigint;
  result jsonb;
begin
  accumulated := public.participant_accumulated_amount(p_participant_id);

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order), '[]'::jsonb) into result
  from (
    select
      so.id,
      so.code,
      so.name,
      so.price,
      so.scope,
      so.booth_id,
      so.stock,
      so.max_per_participant,
      so.min_accumulated_amount,
      so.counts_toward_leaderboard,
      so.is_builtin,
      so.sort_order,
      -- Klaim peserta untuk penawaran ini. Penawaran global dihitung lintas booth,
      -- per_booth otomatis terbatas pada booth-nya karena offer_id sudah spesifik.
      (select count(*) from public.order_special_items i
         join public.orders o on o.id = i.order_id
        where i.offer_id = so.id and o.participant_id = p_participant_id and o.status <> 'void') as claimed,
      accumulated as accumulated_amount,
      case
        when (select count(*) from public.order_special_items i
                join public.orders o on o.id = i.order_id
               where i.offer_id = so.id and o.participant_id = p_participant_id and o.status <> 'void')
             >= so.max_per_participant then 'QUOTA_REACHED'
        when so.stock is not null and so.stock <= 0 then 'OUT_OF_STOCK'
        when so.min_accumulated_amount is not null and accumulated < so.min_accumulated_amount then 'BELOW_MIN_ACCUMULATED'
        else null
      end as blocked_reason
    from public.special_offers so
    where so.is_active
      and (so.scope = 'global' or so.booth_id = p_booth_id)
  ) x;

  return jsonb_build_object('accumulated_amount', accumulated, 'offers', result);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. create_order_transaction: terima beberapa penawaran sekaligus.
-- ---------------------------------------------------------------------------
drop function if exists public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid);

create or replace function public.create_order_transaction(
  p_code text,
  p_participant_id uuid,
  p_booth_id integer,
  p_has_discount_item boolean,
  p_regular_amount integer,
  p_note text,
  p_created_by uuid,
  p_offer_codes text[] default null
)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  booth_row public.booths;
  settings_row public.event_settings;
  new_order public.orders;
  existing_here int;
  initial_status public.order_status := 'pending';
  auto_settle boolean := false;
  offer_codes text[];
  offer_row public.special_offers;
  code_item text;
  special_total int := 0;
  accumulated bigint;
  claims_count int;
  builtin_claimed boolean := false;
begin
  if p_regular_amount < 0 then raise exception using errcode = '22023', message = 'INVALID_AMOUNT'; end if;
  if p_code !~ '^B[1-9][0-9]*-[0-9]{3}$' then raise exception using errcode = '22023', message = 'INVALID_ORDER_CODE'; end if;
  if exists (select 1 from public.orders where code = upper(trim(p_code))) then raise exception using errcode = 'P0005', message = 'ORDER_CODE_USED'; end if;

  -- Urutan lock dipatok: PESERTA dulu, baru BOOTH. Penawaran global tidak
  -- terlindungi lock booth (booth berbeda = baris berbeda), sehingga peserta bisa
  -- menebus di dua booth sekaligus dan keduanya lolos. Lock peserta yang
  -- menyerialisasinya. Urutan konsisten mencegah deadlock antar-booth.
  perform 1 from public.participants where id = p_participant_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'PARTICIPANT_NOT_FOUND'; end if;

  select * into booth_row from public.booths where id = p_booth_id and is_active = true for update;
  if not found then raise exception using errcode = 'P0003', message = 'BOOTH_NOT_FOUND'; end if;
  select * into settings_row from public.event_settings where id = 1;

  -- Kompatibilitas pemanggil lama: has_discount_item = true tanpa daftar penawaran
  -- diartikan mengklaim penawaran builtin booth ini.
  offer_codes := coalesce(p_offer_codes, '{}'::text[]);
  if array_length(offer_codes, 1) is null and p_has_discount_item then
    select array_agg(so.code) into offer_codes
    from public.special_offers so where so.booth_id = p_booth_id and so.is_builtin;
    offer_codes := coalesce(offer_codes, '{}'::text[]);
  end if;

  accumulated := public.participant_accumulated_amount(p_participant_id);

  if not settings_row.cashier_confirmation_required then
    auto_settle := true;
    initial_status := case when settings_row.pickup_mode = 'immediate' then 'handed_over'::public.order_status else 'paid'::public.order_status end;
  end if;

  -- Validasi tiap penawaran SEBELUM order dibuat, supaya tidak ada order separuh
  -- jadi kalau satu penawaran ditolak.
  foreach code_item in array offer_codes loop
    select * into offer_row from public.special_offers where code = code_item for update;
    if not found then raise exception using errcode = 'P0006', message = 'OFFER_NOT_FOUND'; end if;
    if not offer_row.is_active then raise exception using errcode = 'P0006', message = 'OFFER_INACTIVE'; end if;
    if offer_row.scope = 'per_booth' and offer_row.booth_id <> p_booth_id then
      raise exception using errcode = 'P0006', message = 'OFFER_WRONG_BOOTH';
    end if;

    select count(*) into claims_count
    from public.order_special_items i
    join public.orders o on o.id = i.order_id
    where i.offer_id = offer_row.id and o.participant_id = p_participant_id and o.status <> 'void';
    if claims_count >= offer_row.max_per_participant then
      -- Kode lama dipertahankan supaya pesan diskon per-booth di UI tidak berubah.
      raise exception using errcode = 'P0006', message = 'DISCOUNT_ALREADY_TAKEN';
    end if;

    if offer_row.min_accumulated_amount is not null and accumulated < offer_row.min_accumulated_amount then
      raise exception using errcode = 'P0006', message = 'OFFER_BELOW_MIN_ACCUMULATED';
    end if;

    if offer_row.stock is not null then
      if offer_row.stock <= 0 then raise exception using errcode = 'P0004', message = 'DISCOUNT_OUT_OF_STOCK'; end if;
      update public.special_offers set stock = stock - 1 where id = offer_row.id;
      -- Booth builtin: stok lama ikut dijaga agar halaman Booth tetap akurat.
      if offer_row.is_builtin then
        update public.booths set discount_item_stock = discount_item_stock - 1
        where id = offer_row.booth_id and discount_item_stock is not null;
      end if;
    end if;

    special_total := special_total + offer_row.price;
    if offer_row.is_builtin then builtin_claimed := true; end if;
  end loop;

  -- has_discount_item TETAP berarti "klaim penawaran builtin booth ini", bukan
  -- "ada item spesial apa pun". Kalau tebus murah ikut men-set true, kuota diskon
  -- per-booth akan salah terpakai dan laporan lama jadi keliru.
  insert into public.orders (
    code, participant_id, booth_id, has_discount_item, regular_amount, total_amount,
    status, pickup_mode, note, created_by, auto_settled,
    payment_method, paid_at, paid_by, handed_over_at, handed_over_by
  )
  values (
    upper(trim(p_code)), p_participant_id, p_booth_id, builtin_claimed, p_regular_amount, p_regular_amount + special_total,
    initial_status, settings_row.pickup_mode, nullif(trim(p_note), ''), p_created_by, auto_settle,
    null,
    case when auto_settle then now() else null end,
    case when auto_settle then p_created_by else null end,
    case when auto_settle and initial_status = 'handed_over' then now() else null end,
    case when auto_settle and initial_status = 'handed_over' then p_created_by else null end
  )
  returning * into new_order;

  -- Snapshot harga & flag leaderboard per klaim (pola BR-12): mengubah penawaran
  -- tidak boleh mengubah nilai order yang sudah terjadi.
  foreach code_item in array offer_codes loop
    select * into offer_row from public.special_offers where code = code_item;
    insert into public.order_special_items (order_id, offer_id, price_at_claim, counts_toward_leaderboard)
    values (new_order.id, offer_row.id, offer_row.price, offer_row.counts_toward_leaderboard);
  end loop;

  insert into public.audit_logs (order_id, user_id, action, payload)
  values (new_order.id, p_created_by, 'create', jsonb_build_object(
    'code', new_order.code, 'pickup_mode', new_order.pickup_mode,
    'has_discount_item', new_order.has_discount_item, 'auto_settled', auto_settle,
    'status', initial_status, 'offers', offer_codes, 'special_total', special_total));

  if auto_settle then
    insert into public.audit_logs (order_id, user_id, action, payload)
    values (new_order.id, p_created_by, 'pay', jsonb_build_object('automatic', true, 'status', initial_status, 'payment_method', null));
  end if;

  return new_order;

exception when unique_violation then
  if sqlerrm like '%orders_code_key%' or sqlerrm like '%orders_code%' then
    raise exception using errcode = 'P0005', message = 'ORDER_CODE_USED';
  end if;
  raise exception using errcode = 'P0006', message = 'DISCOUNT_ALREADY_TAKEN';
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Void: kembalikan stok ke special_offers, bukan hanya ke booths.
-- ---------------------------------------------------------------------------
create or replace function public.void_order_transaction(p_order_id uuid, p_reason text, p_user_id uuid, p_is_admin boolean default false, p_booth_id integer default null)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  result_order public.orders;
  old_order public.orders;
  claim record;
begin
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'VOID_REASON_REQUIRED';
  end if;

  select * into old_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE';
  end if;

  if p_booth_id is not null then
    if old_order.booth_id <> p_booth_id then raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE'; end if;
    if not old_order.auto_settled then raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE'; end if;
    if old_order.status = 'void' then raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE'; end if;
  elsif old_order.status in ('pending', 'paid') then
    null;
  elsif old_order.status = 'handed_over' and p_is_admin then
    null;
  else
    raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE';
  end if;

  update public.orders
  set status = 'void', void_reason = trim(p_reason), voided_at = now(), voided_by = p_user_id
  where id = p_order_id
  returning * into result_order;

  -- Baris klaim TIDAK dihapus: riwayat harus tetap terlihat, dan status order
  -- sudah cukup menentukan klaim itu tidak dihitung. Yang dikembalikan hanya stok.
  for claim in
    select i.offer_id, so.is_builtin, so.booth_id, so.stock
    from public.order_special_items i
    join public.special_offers so on so.id = i.offer_id
    where i.order_id = p_order_id
  loop
    if claim.stock is not null then
      update public.special_offers set stock = stock + 1 where id = claim.offer_id;
      if claim.is_builtin then
        update public.booths set discount_item_stock = discount_item_stock + 1
        where id = claim.booth_id and discount_item_stock is not null;
      end if;
    end if;
  end loop;

  insert into public.audit_logs (order_id, user_id, action, payload)
  values (p_order_id, p_user_id, 'void', jsonb_build_object(
    'reason', trim(p_reason), 'previous_status', old_order.status,
    'by_admin', p_is_admin, 'by_booth', p_booth_id));

  return result_order;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Auto-void: kembalikan stok penawaran juga.
-- ---------------------------------------------------------------------------
create or replace function public.auto_void_expired_orders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  setting_minutes int;
  voided_count int := 0;
  item public.orders;
  claim record;
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
    for claim in
      select i.offer_id, so.is_builtin, so.booth_id, so.stock
      from public.order_special_items i
      join public.special_offers so on so.id = i.offer_id
      where i.order_id = item.id
    loop
      if claim.stock is not null then
        update public.special_offers set stock = stock + 1 where id = claim.offer_id;
        if claim.is_builtin then
          update public.booths set discount_item_stock = discount_item_stock + 1
          where id = claim.booth_id and discount_item_stock is not null;
        end if;
      end if;
    end loop;

    insert into public.audit_logs (order_id, action, payload)
    values (item.id, 'void', jsonb_build_object('reason', item.void_reason, 'automatic', true));
  end loop;

  return coalesce(voided_count, 0);
end;
$function$;

revoke all on function public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid, text[]) from anon;
revoke all on function public.void_order_transaction(uuid, text, uuid, boolean, integer) from anon;
revoke all on function public.participant_accumulated_amount(uuid) from anon;
revoke all on function public.get_available_offers(uuid, integer) from anon;
revoke all on function public.validate_order_total() from anon;
revoke all on function public.validate_order_total_from_claim() from anon;
