-- Perbaikan: reset data trial gagal dengan "DELETE requires a WHERE clause".
--
-- Gejala: POST /api/admin/reset membalas 500, PostgREST mencatat 400, dan log
-- Postgres menunjukkan `ERROR: DELETE requires a WHERE clause`.
--
-- Penyebab: Supabase mengaktifkan proteksi safe-update (supautils) pada koneksi
-- PostgREST, yang menolak DELETE dan UPDATE tanpa klausa WHERE. Fungsi
-- admin_reset_records memakai `delete from public.orders;` tanpa WHERE.
--
-- Kenapa ini lolos dari pengujian: SQL editor TIDAK menerapkan proteksi tersebut,
-- jadi fungsi ini berhasil saat diuji langsung namun gagal saat dipanggil aplikasi
-- lewat PostgREST. Pelajaran: menguji RPC lewat SQL editor saja tidak cukup untuk
-- membuktikan jalur aplikasi bekerja.
--
-- Perbaikan: beri WHERE yang selalu benar (`where id is not null`) sehingga
-- maksudnya tetap "hapus semua" tapi lolos proteksi. Bukan menonaktifkan
-- proteksinya, karena proteksi itu berguna untuk seluruh koneksi lain.
--
-- Sekalian dua hal yang ikut diperbaiki:
-- 1. Stok penawaran dipulihkan. Stok dikurangi saat klaim, jadi tanpa ini reset
--    trial meninggalkan stok yang sudah berkurang padahal ordernya sudah hilang.
-- 2. Klaim item spesial dihapus eksplisit sebelum order, tidak mengandalkan
--    cascade, supaya jumlah yang dihapus dapat dilaporkan ke admin.
create or replace function public.admin_reset_records(p_actor uuid, p_include_participants boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  deleted_orders int := 0;
  deleted_audits int := 0;
  deleted_participants int := 0;
  deleted_claims int := 0;
  restored_offers int := 0;
begin
  -- Pulihkan stok penawaran sesuai jumlah klaim yang akan dihapus. Hanya
  -- penawaran dengan stok terbatas; NULL berarti tak terbatas.
  with per_offer as (
    select i.offer_id, count(*)::int as jumlah
    from public.order_special_items i
    group by i.offer_id
  )
  update public.special_offers so
  set stock = so.stock + per_offer.jumlah
  from per_offer
  where so.id = per_offer.offer_id and so.stock is not null;
  get diagnostics restored_offers = row_count;

  -- Stok bawaan booth juga dicerminkan di kolom booths.
  with per_booth as (
    select so.booth_id, count(*)::int as jumlah
    from public.order_special_items i
    join public.special_offers so on so.id = i.offer_id
    where so.is_builtin and so.booth_id is not null
    group by so.booth_id
  )
  update public.booths b
  set discount_item_stock = b.discount_item_stock + per_booth.jumlah
  from per_booth
  where b.id = per_booth.booth_id and b.discount_item_stock is not null;

  -- WHERE wajib ada: proteksi safe-update Supabase menolak DELETE tanpa WHERE.
  delete from public.order_special_items where id is not null;
  get diagnostics deleted_claims = row_count;

  -- Audit dihapus sebelum order, kalau tidak FK audit_logs_order_id_fkey menolak
  -- penghapusan order.
  delete from public.audit_logs where order_id is not null;
  get diagnostics deleted_audits = row_count;

  delete from public.orders where id is not null;
  get diagnostics deleted_orders = row_count;

  if p_include_participants then
    delete from public.participants where id is not null;
    get diagnostics deleted_participants = row_count;
  end if;

  insert into public.audit_logs (user_id, action, payload)
  values (
    p_actor,
    'admin_reset_records',
    jsonb_build_object(
      'deleted_orders', deleted_orders,
      'deleted_audits', deleted_audits,
      'deleted_participants', deleted_participants,
      'deleted_claims', deleted_claims,
      'restored_offer_stock', restored_offers,
      'include_participants', p_include_participants
    )
  );

  return jsonb_build_object(
    'deleted_orders', deleted_orders,
    'deleted_audits', deleted_audits,
    'deleted_participants', deleted_participants,
    'deleted_claims', deleted_claims,
    'restored_offer_stock', restored_offers
  );
end;
$function$;

revoke all on function public.admin_reset_records(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_reset_records(uuid, boolean) to service_role;
