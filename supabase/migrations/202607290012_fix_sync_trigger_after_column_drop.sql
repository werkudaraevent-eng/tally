-- HOTFIX: trigger sinkronisasi booth rusak setelah kolom dihapus.
--
-- Migrasi 202607290011 menghapus `special_offers.min_accumulated_amount`, tapi
-- `sync_booth_builtin_offer()` dari 202607290009 masih menyebut kolom itu di
-- daftar INSERT-nya. Akibatnya SETIAP update pada kolom discount_* di tabel
-- booths gagal:
--
--   42703 - column "min_accumulated_amount" of relation "special_offers" does not exist
--
-- Artinya halaman Booth & item sama sekali tidak bisa menyimpan. Terbukti lewat
-- uji update pada booth 5 sebelum perbaikan ini.
--
-- Pelajaran: menghapus kolom wajib disertai pemeriksaan SEMUA fungsi yang
-- menyebutnya, bukan hanya fungsi yang sedang diubah di migrasi itu.
create or replace function public.sync_booth_builtin_offer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.special_offers (
    code, name, price, stock, scope, booth_id, max_per_participant,
    counts_toward_leaderboard, is_active, sort_order, is_builtin
  )
  values (
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
  on conflict (code) do update set
    name = excluded.name,
    price = excluded.price,
    stock = excluded.stock,
    max_per_participant = excluded.max_per_participant,
    is_active = excluded.is_active;
  -- `conditions` dan `counts_toward_leaderboard` sengaja TIDAK ditimpa pada
  -- konflik: keduanya hanya dikelola di halaman Item spesial dan tidak punya
  -- padanan di tabel booths, jadi menimpanya akan menghapus konfigurasi admin.
  return null;
end;
$function$;

revoke all on function public.sync_booth_builtin_offer() from public, anon, authenticated;
grant execute on function public.sync_booth_builtin_offer() to service_role;
