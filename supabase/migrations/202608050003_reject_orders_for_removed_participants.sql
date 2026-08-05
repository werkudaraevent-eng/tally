-- Tolak pembuatan order untuk peserta yang sudah dihapus panitia pusat.
--
-- Masalah yang diperbaiki, terbukti lewat uji langsung ke endpoint:
--   POST /api/orders untuk peserta bertanda source_removed_at -> 201 Created.
--
-- Dua jalur masuk yang sama-sama dipakai staf booth memberi jawaban BERBEDA
-- untuk peserta yang sama:
--   * cari nama  -> /api/booth/participants memfilter `source_removed_at is null`,
--                   peserta tidak muncul, order tidak mungkin dibuat.
--   * scan QR    -> get_participant_by_qr TIDAK memfilter, peserta ditemukan,
--                   order tersimpan tanpa keluhan apa pun.
--
-- Bukan kasus hipotetis. Saat migrasi ini ditulis ada 22 baris bertanda dihapus,
-- dan 10 di antaranya MASIH memegang kode QR aslinya (PEG01102, PEG00202, dst.)
-- karena pengarsipan kode di `upsert_external_participants` hanya berjalan bila
-- kode itu dipakai ulang peserta baru di sumber. Badge fisiknya ada di tangan
-- orang dan tetap bisa discan di meja booth.
--
-- Akibat yang paling merugikan bukan ordernya sendiri, tapi laporan:
-- `/api/admin/reports` dan `/api/booth/participants` memfilter peserta yang
-- dihapus, sehingga order tersebut TERSIMPAN tetapi TIDAK IKUT dihitung. Total di
-- layar booth dan total di laporan pasca-acara jadi berbeda tanpa ada satu pun
-- pesan kesalahan yang menjelaskan sebabnya.
--
-- Ditegakkan di fungsi ini, bukan hanya di layar, karena inilah satu-satunya
-- jalan tulis ke `orders` dan karena aturannya soal INTEGRITAS DATA, bukan soal
-- kenyamanan tampilan.
--
-- Yang dengan sengaja TIDAK diubah: jalur kasir (`/api/cashier/participant`,
-- `settle_orders_transaction`) dan `hand_over_order_transaction`. Order yang
-- dibuat SEBELUM peserta dihapus tetap harus dapat dilunasi dan barangnya
-- diserahkan — uangnya sudah berpindah dan barangnya sudah dijanjikan. Yang
-- dilarang hanya membuat catatan BARU.

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
  participant_row public.participants;
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

  -- Baris peserta kini DIAMBIL, bukan hanya di-lock dengan `perform`. Lock-nya
  -- tetap sama (urutan peserta -> booth dipertahankan, lihat BR-01), tapi
  -- nilainya dibutuhkan untuk pemeriksaan di bawah.
  select * into participant_row from public.participants where id = p_participant_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'PARTICIPANT_NOT_FOUND'; end if;

  -- Satu-satunya aturan baru di migrasi ini.
  --
  -- Diperiksa SETELAH lock diambil, bukan sebelum: tanda dihapus ditulis oleh
  -- `upsert_external_participants` yang berjalan dari cron sinkronisasi, jadi
  -- pemeriksaan tanpa lock bisa membaca nilai yang sudah kedaluwarsa satu langkah.
  --
  -- Kode error dipisahkan dari PARTICIPANT_NOT_FOUND karena tindakan pemulihannya
  -- berbeda: "tidak ditemukan" berarti QR salah baca dan staf harus scan ulang,
  -- sedangkan "sudah dihapus" berarti QR terbaca benar dan peserta harus diarahkan
  -- ke meja registrasi. Satu pesan untuk keduanya membuat staf mencoba scan ulang
  -- berkali-kali untuk keadaan yang tidak akan pernah berubah.
  if participant_row.source_removed_at is not null then
    raise exception using errcode = 'P0008', message = 'PARTICIPANT_REMOVED';
  end if;

  select * into booth_row from public.booths where id = p_booth_id and is_active = true for update;
  if not found then raise exception using errcode = 'P0003', message = 'BOOTH_NOT_FOUND'; end if;

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

  if p_regular_amount = 0 and coalesce(array_length(offer_codes, 1), 0) = 0 then
    raise exception using errcode = '22023', message = 'EMPTY_ORDER';
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

revoke all on function public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid, text[]) from public, anon, authenticated;
grant execute on function public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid, text[]) to service_role;

-- ---------------------------------------------------------------------------
-- Layar booth harus TAHU sebelum menekan tombol, bukan ditolak setelahnya.
-- ---------------------------------------------------------------------------
-- Penolakan di atas mencegah data rusak, tapi kalau hanya itu, staf booth baru
-- mengetahui masalahnya setelah mengisi nominal, memilih item, dan menekan "Buat
-- order" — dengan peserta berdiri menunggu di depan meja. Karena itu keadaan
-- peserta dikirim bersama hasil scan, supaya layar dapat memperingatkan lebih
-- awal dan menonaktifkan tombolnya.
--
-- Peserta TETAP dikembalikan, tidak diubah menjadi PARTICIPANT_NOT_FOUND. Staf
-- perlu melihat nama yang terbaca untuk bisa menjelaskan ke orang di depannya dan
-- menyebutkan namanya ke meja registrasi. "Tidak ditemukan" akan membuat staf
-- menyalahkan kamera dan mencoba scan berulang kali.
create or replace function public.get_participant_by_qr(p_qr_code text, p_booth_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  participant_row public.participants;
  booth_row public.booths;
  existing_orders jsonb;
  taken_here int;
  discount_order public.orders;
  booth_progress int;
  active_booths int;
begin
  select * into participant_row from public.participants where qr_code = trim(p_qr_code);
  if not found then raise exception using errcode = 'P0002', message = 'PARTICIPANT_NOT_FOUND'; end if;
  select * into booth_row from public.booths where id = p_booth_id and is_active = true;
  if not found then raise exception using errcode = 'P0003', message = 'BOOTH_NOT_FOUND'; end if;

  select jsonb_agg(to_jsonb(o) order by o.created_at desc) into existing_orders
    from public.orders o where o.participant_id = participant_row.id and o.booth_id = p_booth_id;

  select count(*) into taken_here from public.orders
    where participant_id = participant_row.id and booth_id = p_booth_id
      and has_discount_item = true and status <> 'void';

  select * into discount_order from public.orders
    where participant_id = participant_row.id and booth_id = p_booth_id
      and has_discount_item = true and status <> 'void'
    order by created_at desc limit 1;

  -- distinct booth_id: satu booth dihitung sekali walau ada beberapa order.
  select count(distinct booth_id) into booth_progress from public.orders
    where participant_id = participant_row.id and status in ('paid', 'handed_over');

  select count(*) into active_booths from public.booths where is_active = true;

  return jsonb_build_object(
    -- `source_removed_at` ditambahkan ke objek peserta. Dikirim sebagai stempel
    -- waktu, bukan boolean, supaya layar dapat menyebutkan KAPAN peserta dihapus
    -- bila itu berguna, tanpa perlu permintaan kedua ke server.
    'participant', jsonb_build_object('id', participant_row.id, 'qr_code', participant_row.qr_code, 'name', participant_row.name, 'company', participant_row.company, 'title', participant_row.title, 'photo_url', participant_row.photo_url, 'allow_name_display', participant_row.allow_name_display, 'source_removed_at', participant_row.source_removed_at),
    -- Disediakan juga di tingkat atas: layar booth memakainya untuk memutuskan
    -- apakah seluruh formulir order dinonaktifkan, dan keputusan setingkat itu
    -- tidak seharusnya bergantung pada penelusuran ke dalam objek bersarang.
    'participant_removed', participant_row.source_removed_at is not null,
    'discount_enabled', booth_row.discount_enabled and booth_row.discount_limit_per_participant > 0,
    'discount_limit', booth_row.discount_limit_per_participant,
    'discount_taken_here', taken_here,
    'discount_available', booth_row.discount_enabled and booth_row.discount_limit_per_participant > taken_here and (booth_row.discount_item_stock is null or booth_row.discount_item_stock > 0),
    'discount_taken_at', discount_order.created_at,
    'existing_orders_at_this_booth', coalesce(existing_orders, '[]'::jsonb),
    'progress', jsonb_build_object('visited', booth_progress, 'total', active_booths),
    'booth', jsonb_build_object('id', booth_row.id, 'code', booth_row.code, 'name', booth_row.name, 'discount_item_name', booth_row.discount_item_name, 'discount_item_price', booth_row.discount_item_price, 'discount_item_stock', booth_row.discount_item_stock, 'discount_enabled', booth_row.discount_enabled, 'discount_limit_per_participant', booth_row.discount_limit_per_participant)
  );
end;
$function$;

revoke all on function public.get_participant_by_qr(text, integer) from public, anon, authenticated;
grant execute on function public.get_participant_by_qr(text, integer) to service_role;
