-- Kode booth tidak lagi harus berpola B1, B2, B3.
--
-- Sebelumnya ada dua lapisan yang memaksa pola `B<angka>`, dan yang kedua lebih
-- berbahaya karena tidak terlihat saat menyimpan booth:
--
--   1. Validasi di API admin menolak kode seperti "PH" ketika booth disimpan.
--   2. `create_order_transaction` menolak kode order `^B[1-9][0-9]*-[0-9]{3}$`.
--
-- Andaikan hanya lapisan pertama yang dilonggarkan, booth "PH" bisa dibuat dan
-- tampak berhasil, tetapi setiap percobaan membuat order di booth itu gagal
-- dengan INVALID_ORDER_CODE. Kegagalannya muncul di tangan staf saat melayani
-- peserta, bukan di layar admin saat menyiapkan acara. Karena itu keduanya
-- dilonggarkan bersama.
--
-- Bentuk baru: satu huruf di depan, lalu huruf atau angka, maksimal 8 karakter.
-- Tanda hubung sengaja TIDAK diizinkan pada kode booth, karena kode order
-- dibentuk sebagai `<kode booth>-<nomor 3 digit>` dan dibaca kembali dengan
-- memotong di tanda hubung (lihat /api/booth/context). Kode booth yang memuat
-- tanda hubung membuat pembacaan itu ambigu.

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

  -- Format umum: kode booth bebas huruf/angka, diikuti nomor tiga digit.
  if upper(trim(p_code)) !~ '^[A-Z][A-Z0-9]{0,7}-[0-9]{3}$' then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_CODE';
  end if;

  if exists (select 1 from public.orders where code = upper(trim(p_code))) then raise exception using errcode = 'P0005', message = 'ORDER_CODE_USED'; end if;

  perform 1 from public.participants where id = p_participant_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'PARTICIPANT_NOT_FOUND'; end if;

  select * into booth_row from public.booths where id = p_booth_id and is_active = true for update;
  if not found then raise exception using errcode = 'P0003', message = 'BOOTH_NOT_FOUND'; end if;

  -- Awalan kode wajib sama dengan kode booth-nya. Pemeriksaan ini menggantikan
  -- ketatnya pola lama: tanpa itu, melonggarkan format berarti order di booth PH
  -- boleh bernomor "B1-001" dan nomor stiker antar-booth bisa saling bertabrakan.
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

revoke all on function public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid, text[]) from public, anon, authenticated;

-- Bentuk kode booth dijaga di database, bukan hanya di validasi API. Booth bisa
-- disimpan lewat jalur lain, dan kode berformat salah baru terasa akibatnya saat
-- staf gagal membuat order di depan peserta.
alter table public.booths drop constraint if exists booths_code_format;
alter table public.booths
  add constraint booths_code_format check (code ~ '^[A-Z][A-Z0-9]{0,7}$');

-- Lapisan ketiga, dan yang paling mudah terlewat: constraint pada tabel `orders`.
--
-- Ditemukan lewat uji end-to-end, bukan dari membaca kode. Melonggarkan validasi
-- API dan fungsi `create_order_transaction` saja tidak cukup — INSERT tetap
-- ditolak di tingkat tabel dengan pesan `orders_code_format`, yang muncul sebagai
-- kegagalan tak terduga di tangan staf, bukan sebagai pesan yang bisa dipahami.
alter table public.orders drop constraint if exists orders_code_format;
alter table public.orders
  add constraint orders_code_format check (code ~ '^[A-Z][A-Z0-9]{0,7}-[0-9]{3}$');
