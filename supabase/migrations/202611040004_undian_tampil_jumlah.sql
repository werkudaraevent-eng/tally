-- ============================================================================
-- Layar undian: pilihan menyembunyikan jumlah peserta yang ikut diundi,
-- diminta Hanung 2026-11-04 ("opsi hide number peserta yg ikut diundi").
--
--   undian_settings.show_pool_size  true (bawaan) = layar tunggu menulis
--                                   "309 peserta siap diundi" dan Spotlight
--                                   wall menulis jumlahnya; false = angka
--                                   tidak dikirim ke layar sama sekali.
--
-- Satu kolom dengan default true: setiap acara tetap seperti sekarang sampai
-- panitia mematikannya di Lucky draw > Stage display. Satu transaksi, aman
-- dijalankan ulang.
--
-- Jalankan SEBELUM kodenya tayang: layar panggung dan Stage display membaca
-- kolom ini.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.undian_settings
  add column if not exists show_pool_size boolean not null default true;

comment on column public.undian_settings.show_pool_size is
  'Layar undian: tampilkan jumlah peserta yang ikut diundi. Bawaan true.';

commit;

notify pgrst, 'reload schema';
