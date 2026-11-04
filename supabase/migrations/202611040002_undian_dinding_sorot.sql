-- ============================================================================
-- Animasi undian "Spotlight wall" (Dinding Sorot), diminta Hanung 2026-11-04
-- untuk gala: seluruh kolam tampil sebagai dinding nama, lampu sorot menyapu,
-- lalu dinding padam bertahap sampai tinggal pemenang.
--
--   undian_prizes.animation   nilai baru 'wall'.
--   undian_prizes.wall_names  'full' (bawaan, nama lengkap di dinding) atau
--                             'initials' (dua huruf, misalnya "A.W.", untuk
--                             acara yang tidak mau daftar tamunya terpampang).
--                             Hanya berarti bila animation = 'wall'.
--
-- Hanya melonggarkan satu check dan menambah satu kolom dengan default 'full'.
-- Tidak ada data yang diubah: setiap hadiah tetap pada animasinya sampai
-- panitia memilih sendiri. Hak akses tabel (service_role saja) berlaku untuk
-- kolom baru. Duplikat acara ikut menyalinnya (duplicate_event lewat to_jsonb).
-- Satu transaksi, aman dijalankan ulang.
--
-- Jalankan SEBELUM kodenya tayang: daftar kolom hadiah menyebut wall_names.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.undian_prizes drop constraint if exists undian_prizes_animation_check;
alter table public.undian_prizes
  add constraint undian_prizes_animation_check check (
    animation in ('wheel', 'slot', 'cards', 'digits', 'dart', 'wall', 'instant')
  );

alter table public.undian_prizes
  add column if not exists wall_names text not null default 'full';

alter table public.undian_prizes drop constraint if exists undian_prizes_wall_names_check;
alter table public.undian_prizes
  add constraint undian_prizes_wall_names_check
  check (wall_names in ('full', 'initials'));

comment on column public.undian_prizes.wall_names is
  'Animasi Spotlight wall: full = nama lengkap di dinding, initials = inisial saja selama undian. Bawaan full.';

commit;

notify pgrst, 'reload schema';
