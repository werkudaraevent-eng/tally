-- ============================================================================
-- Spotlight wall: pilihan "dinding penuh", diminta Hanung 2026-11-05. Dengan
-- satu ubin per orang, tamu bisa menghitung ubin lalu membandingkannya dengan
-- jumlah tamu.
--
--   undian_prizes.wall_tiles  'all' (bawaan, satu ubin per orang di kolam) atau
--                             'fixed' (dinding selalu penuh dengan jumlah ubin
--                             tetap, nama bergantian di ubin selama undian).
--                             Hanya berarti bila animation = 'wall'.
--
-- Satu kolom dengan default 'all': setiap hadiah tetap seperti sekarang sampai
-- panitia memilih sendiri. Duplikat acara ikut menyalinnya (duplicate_event
-- lewat to_jsonb). Satu transaksi, aman dijalankan ulang.
--
-- Jalankan SEBELUM kodenya tayang: layar panggung dan daftar hadiah membaca
-- kolom ini.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.undian_prizes
  add column if not exists wall_tiles text not null default 'all';

alter table public.undian_prizes drop constraint if exists undian_prizes_wall_tiles_check;
alter table public.undian_prizes
  add constraint undian_prizes_wall_tiles_check
  check (wall_tiles in ('all', 'fixed'));

comment on column public.undian_prizes.wall_tiles is
  'Animasi Spotlight wall: all = satu ubin per orang, fixed = dinding penuh dengan nama bergantian. Bawaan all.';

commit;

notify pgrst, 'reload schema';
