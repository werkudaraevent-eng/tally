-- ============================================================================
-- Pesan sesudah scan per checkpoint (Check-in > Checkpoints > Message after scan).
-- Diminta Hanung 2026-10-29: panitia ingin layar hasil scan Gala Dinner saja
-- yang menyebut "berhak mengikuti Gala Dinner", jadi kalimatnya diatur per
-- checkpoint, bukan satu kalimat untuk semua.
--
-- Dua kolom teks di checkpoints, tanpa default (null):
--
--   scan_message      bahasa utama acara, tampil di layar hasil scan mandiri
--                     peserta (baru tercatat dan sudah tercatat sebelumnya)
--   scan_message_en   halaman peserta English; kosong = pakai scan_message
--
-- Null berarti tanpa pesan: layar hasil sama seperti sebelumnya. Teks biasa,
-- dirender sebagai teks (bukan HTML). Panjang 1..200 karakter sesudah trim,
-- sama dengan bentuk title/place.
--
-- Hanya menambah dua kolom dan dua CHECK bentuk. Tidak ada data yang diubah:
-- setiap acara berubah 0 px. Hak akses tabel yang sudah ada (service_role saja)
-- berlaku untuk kolom baru. Satu transaksi, aman dijalankan ulang.
--
-- Aman sebelum atau sesudah kodenya tayang: kode membaca checkpoints dengan
-- select *, dan menyimpan pesan sebelum migrasi ini dijawab 409
-- CHECKPOINT_MESSAGE_NOT_READY.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.checkpoints
  add column if not exists scan_message text,
  add column if not exists scan_message_en text;

alter table public.checkpoints drop constraint if exists checkpoints_scan_message_check;
alter table public.checkpoints
  add constraint checkpoints_scan_message_check
  check (scan_message is null or char_length(btrim(scan_message)) between 1 and 200);

alter table public.checkpoints drop constraint if exists checkpoints_scan_message_en_check;
alter table public.checkpoints
  add constraint checkpoints_scan_message_en_check
  check (scan_message_en is null or char_length(btrim(scan_message_en)) between 1 and 200);

comment on column public.checkpoints.scan_message is
  'Pesan di layar hasil scan mandiri peserta untuk checkpoint ini (bahasa utama). Null = tanpa pesan. 1 sampai 200 karakter.';
comment on column public.checkpoints.scan_message_en is
  'Pesan scan untuk halaman peserta English. Null = pakai scan_message. 1 sampai 200 karakter.';

notify pgrst, 'reload schema';

commit;
