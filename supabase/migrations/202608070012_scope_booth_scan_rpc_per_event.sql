-- ============================================================================
-- Scope event pada RPC scan booth.
--
-- DUA kebocoran terbukti dengan event kedua aktif:
--   progress.total (penyebut "sudah keliling N booth"): 10 -> 11
--     Booth event lain ikut dihitung, jadi peserta yang sudah keliling semua
--     booth terlihat belum selesai. Angka ini juga tampil di proyektor.
--   penawaran tersedia di layar booth: 1 -> 2
--     Penawaran scope 'global' milik event LAIN muncul dan bisa diklaim.
--
-- `participant_accumulated_amount`, `participant_spend`, dan
-- `participant_booth_count` SENGAJA TIDAK diubah: DIUKUR AMAN karena order sudah
-- terikat event lewat FK komposit, dan participant_id hanya ada di satu event.
-- Mengubah yang sudah benar hanya menambah permukaan kesalahan.
--
-- `qr_code` kini unik PER EVENT (bukan global), jadi pencarian tanpa filter event
-- bisa mengembalikan peserta event lain untuk kode yang sama. Diuji dengan QR
-- KEMBAR di dua event: masing-masing event mengembalikan pesertanya sendiri.
--
-- Versi lama DI-DROP agar tidak ada pintu tanpa scope (pelajaran dari 42725).
-- Diuji 5/5: progress 10->10, penawaran 1->1, QR kembar benar di kedua event,
-- dan tanpa argumen event saat 2 event aktif DITOLAK P0009.
-- ============================================================================

drop function if exists public.get_participant_by_qr(text, integer);
drop function if exists public.get_available_offers(uuid, integer);

create function public.get_participant_by_qr(p_qr_code text, p_booth_id integer, p_event_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_event uuid := public.resolve_event_id(p_event_id);
  participant_row public.participants; booth_row public.booths;
  existing_orders jsonb; taken_here int; discount_order public.orders;
  booth_progress int; active_booths int;
begin
  select * into participant_row from public.participants
  where qr_code = trim(p_qr_code) and event_id = v_event;
  if not found then raise exception using errcode='P0002', message='PARTICIPANT_NOT_FOUND'; end if;

  select * into booth_row from public.booths
  where id = p_booth_id and event_id = v_event and is_active = true;
  if not found then raise exception using errcode='P0003', message='BOOTH_NOT_FOUND'; end if;

  -- Query berbasis participant_id/booth_id di bawah ini tidak perlu filter event
  -- tambahan: keduanya sudah terikat ke satu event lewat FK komposit.
  select jsonb_agg(to_jsonb(o) order by o.created_at desc) into existing_orders
    from public.orders o where o.participant_id = participant_row.id and o.booth_id = p_booth_id;

  select count(*) into taken_here from public.orders
    where participant_id = participant_row.id and booth_id = p_booth_id
      and has_discount_item = true and status <> 'void';

  select * into discount_order from public.orders
    where participant_id = participant_row.id and booth_id = p_booth_id
      and has_discount_item = true and status <> 'void'
    order by created_at desc limit 1;

  select count(distinct booth_id) into booth_progress from public.orders
    where participant_id = participant_row.id and status in ('paid','handed_over');

  -- Penyebut progress WAJIB difilter event. Tanpa ini booth event lain ikut
  -- terhitung dan peserta yang sudah keliling semua booth terlihat belum selesai.
  select count(*) into active_booths from public.booths
  where is_active = true and event_id = v_event;

  return jsonb_build_object(
    'participant', jsonb_build_object('id', participant_row.id, 'qr_code', participant_row.qr_code, 'name', participant_row.name, 'company', participant_row.company, 'title', participant_row.title, 'photo_url', participant_row.photo_url, 'allow_name_display', participant_row.allow_name_display, 'source_removed_at', participant_row.source_removed_at),
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
end $$;

create function public.get_available_offers(p_participant_id uuid, p_booth_id integer, p_event_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_event uuid := public.resolve_event_id(p_event_id); accumulated bigint; result jsonb;
begin
  accumulated := public.participant_accumulated_amount(p_participant_id);

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order), '[]'::jsonb) into result
  from (
    select so.id, so.code, so.name, so.price, so.scope, so.booth_id, so.stock,
      so.max_per_participant, so.conditions, so.counts_toward_leaderboard,
      so.is_builtin, so.sort_order,
      (select count(*) from public.order_special_items i
         join public.orders o on o.id = i.order_id
        where i.offer_id = so.id and o.participant_id = p_participant_id and o.status <> 'void') as claimed,
      accumulated as accumulated_amount,
      public.evaluate_offer_conditions(p_participant_id, p_booth_id, so.conditions) as condition_result,
      case
        when (select count(*) from public.order_special_items i
                join public.orders o on o.id = i.order_id
               where i.offer_id = so.id and o.participant_id = p_participant_id and o.status <> 'void')
             >= so.max_per_participant then 'QUOTA_REACHED'
        when so.stock is not null and so.stock <= 0 then 'OUT_OF_STOCK'
        when not (public.evaluate_offer_conditions(p_participant_id, p_booth_id, so.conditions)->>'passed')::boolean
          then 'CONDITIONS_NOT_MET'
        else null
      end as blocked_reason
    from public.special_offers so
    where so.is_active
      -- Filter event WAJIB: penawaran scope 'global' tidak dibatasi booth, jadi
      -- tanpa ini penawaran event lain muncul di layar booth dan bisa diklaim.
      and so.event_id = v_event
      and (so.scope = 'global' or so.booth_id = p_booth_id)
  ) x;

  return jsonb_build_object('accumulated_amount', accumulated, 'offers', result);
end $$;

revoke all on function public.get_participant_by_qr(text, integer, uuid) from public, anon, authenticated;
revoke all on function public.get_available_offers(uuid, integer, uuid) from public, anon, authenticated;
