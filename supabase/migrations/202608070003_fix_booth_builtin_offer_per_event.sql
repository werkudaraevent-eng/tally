-- ============================================================================
-- Perbaikan regresi dari TAHAP 2.
--
-- `sync_booth_builtin_offer` memakai `on conflict (code)`, yang bergantung pada
-- constraint `special_offers_code_key`. TAHAP 2 menggantinya dengan index unik
-- `(event_id, code)`, sehingga trigger gagal dengan
--   42P10 there is no unique or exclusion constraint matching the ON CONFLICT
--
-- Akibatnya SETIAP tulis ke booths gagal -- termasuk RPC admin_upsert_booth
-- yang dipakai halaman /admin/booths. MEASURED sebelum perbaikan: UPDATE booth
-- 42P10, RPC admin_upsert_booth 42P10. Sesudah: keduanya berhasil, nilai tidak
-- berubah, jumlah special_offers tetap 15.
--
-- Pelajaran: mengganti constraint unik memutus setiap `ON CONFLICT` yang
-- menunjuknya, dan kegagalannya TIDAK muncul saat migrasi dijalankan -- hanya
-- saat baris berikutnya ditulis. Grep `on conflict` sebelum mengganti index unik.
-- ============================================================================

create or replace function public.sync_booth_builtin_offer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.special_offers (
    event_id, code, name, price, stock, scope, booth_id, max_per_participant,
    counts_toward_leaderboard, is_active, sort_order, is_builtin
  )
  values (
    new.event_id,
    'booth_' || new.id || '_diskon',
    new.discount_item_name,
    new.discount_item_price,
    new.discount_item_stock,
    'per_booth',
    new.id,
    new.discount_limit_per_participant,
    false,
    new.discount_enabled,
    new.id,
    true
  )
  -- Menunjuk index unik per-event yang menggantikan special_offers_code_key.
  -- Target ON CONFLICT harus cocok dengan index yang BENAR-BENAR ADA, bukan
  -- dengan yang dulu ada.
  on conflict (event_id, code) do update set
    name = excluded.name,
    price = excluded.price,
    stock = excluded.stock,
    max_per_participant = excluded.max_per_participant,
    is_active = excluded.is_active;
  return null;
end;
$function$;

revoke all on function public.sync_booth_builtin_offer() from public, anon, authenticated;
