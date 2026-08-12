-- ============================================================================
-- Scope event pada RPC DESTRUKTIF.
--
-- TEMUAN TERBURUK SEJAUH INI, diukur pada data nyata:
--   reset "untuk event 1" -> order event1 225 -> 0  (benar)
--                            order event2   1 -> 0  <-- IKUT TERHAPUS
-- `admin_reset_records` menjalankan `delete from public.orders where id is not
-- null`, jadi mereset satu event MENGHAPUS SELURUH TRANSAKSI EVENT LAIN. Tidak
-- ada galat, tidak ada peringatan, dan tidak dapat dibatalkan.
--
-- p_event_id WAJIB (tanpa default) pada reset dan settle: untuk operasi yang
-- menghapus atau melunasi uang, "menebak event" tidak boleh jadi kemungkinan.
-- resolve_event_id pun TIDAK dipakai di sini -- fallback event-aktif-tunggal
-- masuk akal untuk membaca papan, tidak untuk menghapus 225 order.
--
-- auto_void_expired_orders BERBEDA: ia dipanggil pg_cron tanpa argumen setiap 5
-- menit. Ia tidak boleh melempar saat >1 event aktif dan tidak boleh memilih satu
-- event; ia MEMPROSES SEMUA event, masing-masing memakai
-- pending_auto_void_minutes miliknya sendiri.
--
-- Diuji: reset event1 -> event2 UTUH; reset tanpa event DITOLAK P0009;
-- auto_void memproses 2 order lintas event dengan audit.event_id yang benar;
-- settle event2 tidak menyentuh pending event1.
-- ============================================================================

drop function if exists public.admin_reset_records(uuid, boolean);

create function public.admin_reset_records(p_event_id uuid, p_actor uuid, p_include_participants boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  deleted_orders int := 0; deleted_audits int := 0; deleted_participants int := 0;
  deleted_claims int := 0; restored_offers int := 0;
begin
  if p_event_id is null then raise exception using errcode='P0009', message='EVENT_REQUIRED'; end if;

  with per_offer as (
    select i.offer_id, count(*)::int as jumlah
    from public.order_special_items i
    where i.event_id = p_event_id
    group by i.offer_id
  )
  update public.special_offers so set stock = so.stock + per_offer.jumlah
  from per_offer where so.id = per_offer.offer_id and so.event_id = p_event_id and so.stock is not null;
  get diagnostics restored_offers = row_count;

  with per_booth as (
    select so.booth_id, count(*)::int as jumlah
    from public.order_special_items i
    join public.special_offers so on so.id = i.offer_id
    where i.event_id = p_event_id and so.is_builtin and so.booth_id is not null
    group by so.booth_id
  )
  update public.booths b set discount_item_stock = b.discount_item_stock + per_booth.jumlah
  from per_booth where b.id = per_booth.booth_id and b.event_id = p_event_id and b.discount_item_stock is not null;

  delete from public.order_special_items where event_id = p_event_id;
  get diagnostics deleted_claims = row_count;

  -- Hanya audit yang menempel pada ORDER. Baris konfigurasi tetap disimpan:
  -- ia bukti siapa mengubah apa, dan reset transaksi tidak menghapus keputusan.
  delete from public.audit_logs where order_id is not null and event_id = p_event_id;
  get diagnostics deleted_audits = row_count;

  delete from public.orders where event_id = p_event_id;
  get diagnostics deleted_orders = row_count;

  if p_include_participants then
    delete from public.participants where event_id = p_event_id;
    get diagnostics deleted_participants = row_count;
  end if;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'admin_reset_records', jsonb_build_object(
    'deleted_orders', deleted_orders, 'deleted_audits', deleted_audits,
    'deleted_participants', deleted_participants, 'deleted_claims', deleted_claims,
    'restored_offer_stock', restored_offers, 'include_participants', p_include_participants));

  return jsonb_build_object('deleted_orders', deleted_orders, 'deleted_audits', deleted_audits,
    'deleted_participants', deleted_participants, 'deleted_claims', deleted_claims,
    'restored_offer_stock', restored_offers);
end $$;

create or replace function public.auto_void_expired_orders()
returns integer language plpgsql security definer set search_path=public as $$
declare voided_count int := 0; item public.orders; claim record; ev record;
begin
  create temporary table if not exists _auto_voided (like public.orders) on commit drop;
  delete from _auto_voided;

  -- Satu putaran per event. Event arsip/selesai DILEWATI: ordernya sudah final
  -- dan laporannya sudah diserahkan.
  for ev in
    select es.event_id, es.pending_auto_void_minutes as menit
    from public.event_settings es
    join public.events e on e.id = es.event_id
    where e.status in ('active','draft') and es.pending_auto_void_minutes is not null
  loop
    with candidates as (
      select id from public.orders
      where status='pending' and event_id = ev.event_id
        and created_at <= now() - make_interval(mins => ev.menit)
      for update skip locked
    ), expired as (
      update public.orders o
      set status='void',
          void_reason='Auto-void: melewati batas waktu pembayaran',
          voided_at=now()
      where o.id in (select id from candidates)
      returning o.*
    )
    insert into _auto_voided select * from expired;
  end loop;

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
    -- event_id diambil dari ORDER-nya, bukan ditebak: satu putaran cron bisa
    -- memuat order dari beberapa event sekaligus.
    insert into public.audit_logs (event_id, order_id, action, payload)
    values (item.event_id, item.id, 'void', jsonb_build_object('reason', item.void_reason, 'automatic', true));
  end loop;

  return coalesce(voided_count, 0);
end $$;

drop function if exists public.settle_pending_orders_without_cashier(uuid);

create function public.settle_pending_orders_without_cashier(p_event_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare settled_count int := 0; item public.orders;
begin
  if p_event_id is null then raise exception using errcode='P0009', message='EVENT_REQUIRED'; end if;
  for item in
    select * from public.orders where status='pending' and event_id = p_event_id order by created_at for update
  loop
    update public.orders
    set status = case when item.pickup_mode='immediate' then 'handed_over'::public.order_status else 'paid'::public.order_status end,
        auto_settled = true, paid_at = now(), paid_by = p_user_id,
        handed_over_at = case when item.pickup_mode='immediate' then now() else null end,
        handed_over_by = case when item.pickup_mode='immediate' then p_user_id else null end
    where id = item.id;
    insert into public.audit_logs (event_id, order_id, user_id, action, payload)
    values (p_event_id, item.id, p_user_id, 'pay',
      jsonb_build_object('automatic', true, 'reason', 'cashier_confirmation_disabled', 'payment_method', null));
    settled_count := settled_count + 1;
  end loop;
  return jsonb_build_object('settled', settled_count);
end $$;

revoke all on function public.admin_reset_records(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.auto_void_expired_orders() from public, anon, authenticated;
revoke all on function public.settle_pending_orders_without_cashier(uuid, uuid) from public, anon, authenticated;
