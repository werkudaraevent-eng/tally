-- ============================================================================
-- Hari Agenda yang tampil sebelum Masuk (Agenda > Section > Show before sign-in).
-- Disetujui Hanung 2026-10-26 (KSO: halaman acara hanya 6-8 Nov, hari
-- keberangkatan hanya di portal).
--
-- Satu kolom boolean di rundown_sections:
--
--   true   bagian ini tampil di halaman acara dan layar /rundown untuk
--          pengunjung yang belum masuk (bawaan, sama dengan sekarang)
--   false  hanya peserta yang sudah masuk yang melihatnya, di portal
--
-- is_published tetap saklar utama: bagian yang belum terbit tidak tampil di
-- mana pun, apa pun nilai kolom ini.
--
-- Hanya menambah satu kolom NOT NULL DEFAULT true. Tidak ada data yang
-- diubah: setiap bagian tetap tampil seperti sekarang, jadi setiap acara
-- berubah 0 px. Hak akses tabel yang sudah ada berlaku untuk kolom baru.
-- Satu transaksi, aman dijalankan ulang.
--
-- Aman sebelum atau sesudah kodenya tayang: kode membaca kolom ini dengan
-- cadangan tanpa kolom bila belum ada (42703), dan menyimpan sakelarnya
-- sebelum migrasi ini dijawab 409 PUBLIC_DAY_NOT_READY.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.rundown_sections
  add column if not exists show_before_sign_in boolean not null default true;

comment on column public.rundown_sections.show_before_sign_in is
  'Agenda > Show before sign-in. true = tampil di halaman acara dan /rundown sebelum masuk; false = hanya di portal peserta.';

notify pgrst, 'reload schema';

commit;
