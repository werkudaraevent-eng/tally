-- Booth tanpa transaksi.
--
-- Kebutuhannya: ada booth yang tidak menjual apa pun, hanya menyerahkan satu
-- barang ke tiap peserta (mis. tas belanja) dan maksimal sekali per orang.
--
-- Sebelum ini, satu-satunya cara adalah mengandalkan operator booth mengosongkan
-- kolom "Item reguler". Kalau lupa, nominal salah langsung masuk laporan dan
-- hitungan top spender, dan tidak ada yang menahannya. Disiplin manusia bukan
-- kontrol yang memadai untuk angka yang masuk laporan keuangan.
--
-- Penyelesaiannya: sifat booth ditetapkan sekali oleh admin, lalu ditegakkan di
-- database. Layar operator menyembunyikan kolom nominal, tapi itu hanya
-- kenyamanan; yang benar-benar menolak nominal adalah fungsi di bawah ini.
-- Klaim sekali per peserta tetap ditangani `special_offers.max_per_participant`
-- yang sudah ada, jadi tidak ada mekanisme kuota baru yang perlu dibuat.

alter table public.booths
  add column if not exists transactions_enabled boolean not null default true;

comment on column public.booths.transactions_enabled is
  'false = booth tanpa transaksi (hanya serah terima barang). create_order_transaction menolak regular_amount > 0 untuk booth ini.';

-- admin_upsert_booth: terima sifat booth dari admin.
--
-- Parameter baru ditaruh di akhir dengan default true supaya pemanggil lama tetap
-- bekerja dan booth yang sudah ada tidak berubah sifatnya saat migrasi berjalan.
create or replace function public.admin_upsert_booth(
  p_id integer,
  p_code text,
  p_name text,
  p_discount_item_name text,
  p_discount_item_stock integer,
  p_is_active boolean,
  p_discount_enabled boolean,
  p_discount_limit_per_participant integer,
  p_transactions_enabled boolean default true
)
returns booths
language plpgsql
security definer
set search_path to 'public'
as $function$
declare result public.booths;
begin
  if p_id is null then
    insert into public.booths (id, code, name, discount_item_name, discount_item_price, discount_item_stock, is_active, discount_enabled, discount_limit_per_participant, transactions_enabled)
    values ((select coalesce(max(id), 0) + 1 from public.booths), upper(trim(p_code)), trim(p_name), trim(p_discount_item_name), 1, p_discount_item_stock, coalesce(p_is_active, true), coalesce(p_discount_enabled, true), coalesce(p_discount_limit_per_participant, 1), coalesce(p_transactions_enabled, true))
    returning * into result;
  else
    update public.booths set
      code = upper(trim(p_code)),
      name = trim(p_name),
      discount_item_name = trim(p_discount_item_name),
      discount_item_stock = p_discount_item_stock,
      is_active = coalesce(p_is_active, is_active),
      discount_enabled = coalesce(p_discount_enabled, discount_enabled),
      discount_limit_per_participant = coalesce(p_discount_limit_per_participant, discount_limit_per_participant),
      transactions_enabled = coalesce(p_transactions_enabled, transactions_enabled)
    where id = p_id
    returning * into result;
    if not found then raise exception using errcode = 'P0002', message = 'BOOTH_NOT_FOUND'; end if;
  end if;
  return result;
end;
$function$;

-- create_order_transaction: tolak nominal di booth tanpa transaksi.
--
-- Definisi disalin utuh dari versi live (202607310003) dan HANYA ditambahi satu
-- pemeriksaan setelah booth terkunci. Ditulis ulang seluruhnya, bukan ditambal,
-- karena PostgreSQL tidak punya cara menambahkan satu baris ke fungsi yang ada.
--
-- Ditempatkan setelah `select ... from booths ... for update`, bukan di awal
-- bersama pemeriksaan p_regular_amount < 0: sifat booth baru diketahui setelah
-- barisnya dibaca.
create or replace function public.create_order_transaction(
  p_code text,
  p_participant_id uuid,
  p_booth_id integer,
  p_has_discount_item boolean,
  p_regular_amount integer,
  p_note text,
  p_created_by uuid,
  p_offer_codes text[] default null::text[]
)
returns orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  booth_row public.booths;
  settings_row public.event_settings;
  new_order public.orders;
  initial_status public.order_status := 'pending';
  auto_settle boolean := false;
  offer_codes text[];
  offer_row public.special_offers;
  code_item text;
  special_total int := 0;
  claims_count int;
  builtin_claimed boolean := false;
  cond_result jsonb;
begin
  if p_regular_amount < 0 then raise exception using errcode = '22023', message = 'INVALID_AMOUNT'; end if;

  if upper(trim(p_code)) !~ '^[A-Z][A-Z0-9]{0,7}-[0-9]{3}$' then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_CODE';
  end if;

  if exists (select 1 from public.orders where code = upper(trim(p_code))) then raise exception using errcode = 'P0005', message = 'ORDER_CODE_USED'; end if;

  perform 1 from public.participants where id = p_participant_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'PARTICIPANT_NOT_FOUND'; end if;

  select * into booth_row from public.booths where id = p_booth_id and is_active = true for update;
  if not found then raise exception using errcode = 'P0003', message = 'BOOTH_NOT_FOUND'; end if;

  -- Satu-satunya tambahan terhadap versi sebelumnya.
  if not booth_row.transactions_enabled and p_regular_amount <> 0 then
    raise exception using errcode = '22023', message = 'BOOTH_WITHOUT_TRANSACTIONS';
  end if;

  if upper(trim(p_code)) !~ ('^' || upper(booth_row.code) || '-[0-9]{3}$') then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_CODE';
  end if;

  select * into settings_row from public.event_settings where id = 1;

  offer_codes := coalesce(p_offer_codes, '{}'::text[]);
  if array_length(offer_codes, 1) is null and p_has_discount_item then
    select array_agg(so.code) into offer_codes
    from public.special_offers so where so.booth_id = p_booth_id and so.is_builtin;
    offer_codes := coalesce(offer_codes, '{}'::text[]);
  end if;

  if not settings_row.cashier_confirmation_required then
    auto_settle := true;
    initial_status := case when settings_row.pickup_mode = 'immediate' then 'handed_over'::public.order_status else 'paid'::public.order_status end;
  end if;

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
      raise exception using errcode = 'P0006', message = 'DISCOUNT_ALREADY_TAKEN';
    end if;

    cond_result := public.evaluate_offer_conditions(p_participant_id, p_booth_id, offer_row.conditions);
    if not (cond_result->>'passed')::boolean then
      raise exception using errcode = 'P0006', message = 'OFFER_CONDITIONS_NOT_MET';
    end if;

    if offer_row.stock is not null then
      if offer_row.stock <= 0 then raise exception using errcode = 'P0004', message = 'DISCOUNT_OUT_OF_STOCK'; end if;
      update public.special_offers set stock = stock - 1 where id = offer_row.id;
      if offer_row.is_builtin then
        update public.booths set discount_item_stock = discount_item_stock - 1
        where id = offer_row.booth_id and discount_item_stock is not null;
      end if;
    end if;

    special_total := special_total + offer_row.price;
    if offer_row.is_builtin then builtin_claimed := true; end if;
  end loop;

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

-- Signature admin_upsert_booth berubah (tambah satu argumen), jadi grant lama
-- tidak berlaku untuk signature baru. Tanpa blok ini, fungsi baru mewarisi
-- EXECUTE ke PUBLIC dan dapat dipanggil dengan publishable key tanpa login —
-- kesalahan yang sudah pernah terjadi dan diperbaiki di 202607290008.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_upsert_booth', 'create_order_transaction')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end;
$$;

-- Signature lama admin_upsert_booth dibuang supaya tidak ada dua fungsi dengan
-- nama sama yang berbeda perilaku. Membiarkannya berarti pemanggil yang lupa
-- mengirim argumen baru diam-diam memakai versi lama yang tidak mengenal
-- transactions_enabled.
drop function if exists public.admin_upsert_booth(integer, text, text, text, integer, boolean, boolean, integer);
