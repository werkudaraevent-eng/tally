-- Perbaikan sinkronisasi booth <-> item spesial.
--
-- Dua bug yang terbukti setelah 202607290006:
-- 1. Mengedit item diskon di halaman "Booth & item" TIDAK mengubah baris
--    special_offers builtin milik booth itu. Akibatnya halaman Booth & item dan
--    halaman Item spesial dapat menampilkan nama, kuota, dan stok yang berbeda,
--    dan yang dipakai saat order dibuat adalah nilai di special_offers.
-- 2. Booth BARU tidak mendapat baris special_offers sama sekali, sehingga item
--    diskon booth tersebut tidak pernah muncul di layar booth. Gagal diam-diam.
--
-- Backfill di 202607290006 hanya berjalan sekali, jadi sinkronisasi harus
-- ditegakkan terus-menerus di database, bukan hanya di lapisan API. Halaman Booth
-- memakai admin_upsert_booth dan halaman Item spesial memakai UPDATE langsung;
-- trigger menutup kedua jalur sekaligus.

create or replace function public.sync_booth_builtin_offer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.special_offers (
    code, name, price, stock, scope, booth_id, max_per_participant,
    min_accumulated_amount, counts_toward_leaderboard, is_active, sort_order, is_builtin
  )
  values (
    'booth_' || new.id || '_diskon',
    new.discount_item_name,
    new.discount_item_price,
    new.discount_item_stock,
    'per_booth',
    new.id,
    new.discount_limit_per_participant,
    null,
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
  -- min_accumulated_amount & counts_toward_leaderboard sengaja TIDAK ditimpa:
  -- keduanya hanya ada di halaman Item spesial dan tidak punya padanan di tabel
  -- booths, jadi menimpanya akan menghapus konfigurasi admin.
  return null;
end;
$function$;

drop trigger if exists booths_sync_builtin_offer on public.booths;
create trigger booths_sync_builtin_offer
  after insert or update of discount_item_name, discount_item_price, discount_item_stock, discount_enabled, discount_limit_per_participant
  on public.booths
  for each row execute function public.sync_booth_builtin_offer();

-- Perbaiki booth yang sudah ada tapi belum punya offer builtin (bug 2), dan
-- selaraskan yang sudah menyimpang (bug 1).
insert into public.special_offers (
  code, name, price, stock, scope, booth_id, max_per_participant,
  min_accumulated_amount, counts_toward_leaderboard, is_active, sort_order, is_builtin
)
select 'booth_' || b.id || '_diskon', b.discount_item_name, b.discount_item_price,
       b.discount_item_stock, 'per_booth', b.id, b.discount_limit_per_participant,
       null, false, b.discount_enabled, b.id, true
from public.booths b
on conflict (code) do update set
  name = excluded.name,
  price = excluded.price,
  stock = excluded.stock,
  max_per_participant = excluded.max_per_participant,
  is_active = excluded.is_active;

revoke all on function public.sync_booth_builtin_offer() from public, anon, authenticated;
grant execute on function public.sync_booth_builtin_offer() to service_role;
