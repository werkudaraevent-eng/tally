-- ============================================================================
-- Undian: animasi baru 'pack' (Mesin Kartu, "Card machine"), diminta Hanung
-- 2026-11-07.
--
--   animation 'pack'    Mesin vending 3D menjatuhkan bungkus kartu; bungkus
--                       disobek dan kartu dibuka satu per satu, satu kartu per
--                       pemenang (paling banyak 30 per bungkus).
--
--   pack_contents       'one' (bawaan): semua kartu memenangkan hadiah ini.
--                       'all': satu undian mengundi setiap hadiah aktif yang
--                       masih punya sisa kuota di sesi aktif; hadiah ini kartu
--                       terakhir (Grand Prize). Pemenang tetap dicatat per
--                       hadiah di undian_winners seperti biasa (prize_id
--                       masing-masing), jadi kuota, ekspor, dan kartu Hadiah
--                       kamu tidak berubah.
--
--   card_tier           Warna kartu hadiah ini: 'common' biru (bawaan),
--                       'rare' ungu, 'grand' emas.
--
-- Hadiah yang sudah ada mendapat nilai bawaan dan tetap memakai animasinya
-- sendiri: tidak ada yang berubah sampai panitia memilih Card machine. Satu
-- transaksi, aman dijalankan ulang.
--
-- Jalankan SEBELUM kodenya tayang: kode baru membaca kedua kolom ini, dan
-- tanpa kolomnya halaman Lucky draw di CMS gagal memuat daftar hadiah (42703).
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.undian_prizes drop constraint if exists undian_prizes_animation_check;
alter table public.undian_prizes
  add constraint undian_prizes_animation_check check (
    animation in ('wheel', 'slot', 'cards', 'digits', 'dart', 'wall', 'tunnel', 'drum', 'arena', 'cahaya', 'pack', 'instant')
  );

alter table public.undian_prizes add column if not exists pack_contents text not null default 'one';
alter table public.undian_prizes add column if not exists card_tier text not null default 'common';

alter table public.undian_prizes drop constraint if exists undian_prizes_pack_contents_check;
alter table public.undian_prizes
  add constraint undian_prizes_pack_contents_check check (pack_contents in ('one', 'all'));

alter table public.undian_prizes drop constraint if exists undian_prizes_card_tier_check;
alter table public.undian_prizes
  add constraint undian_prizes_card_tier_check check (card_tier in ('common', 'rare', 'grand'));

commit;

notify pgrst, 'reload schema';
