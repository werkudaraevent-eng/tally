-- ============================================================================
-- Foto serah terima di meja ambil bagasi (Check-in > Sessions > Luggage:
-- Pick-up > Photo at hand-over). Diminta Hanung 2026-11-04, KSO.
--
-- Meja titip sudah memotret koper (luggage_drops.photo_path). Meja ambil kini
-- boleh memotret koper yang diserahkan juga, sebagai bukti pendukung bila ada
-- yang bilang kopernya tidak diterima. Jam dan nama petugas tetap bukti
-- utamanya; foto boleh gagal tanpa membatalkan penyerahan.
--
--   attendance_sessions.handover_photo   saklar per sesi Pick-up, bawaan MATI:
--                                        sesi lain dan acara lain berubah 0 px.
--   luggage_drops.handover_photo_path    path di bucket privat luggage-photos,
--                                        bentuk rata yang sama dengan foto
--                                        titip (<event_id>/<session>-<peserta>-<uuid>.jpg).
--                                        Satu penyerahan bisa mencakup titipan
--                                        dari beberapa meja: barisnya menunjuk
--                                        berkas yang sama.
--
-- Penghapus foto (job tally-bagasi-foto, migrasi 202610230004) membaca folder
-- acara di bucket, jadi foto serah terima ikut terhapus 30 hari setelah acara
-- tanpa ubahan job. Tidak ada fungsi baru. Satu transaksi, aman dijalankan
-- ulang.
--
-- Urutan dengan kode: kode PR ini membaca kedua kolom lewat select * dan
-- mengunci saklarnya selama kolomnya belum ada, jadi kode yang masuk lebih dulu
-- tidak merusak apa pun (saklarnya hanya belum bisa dinyalakan).
-- ============================================================================

begin;
set local lock_timeout = '5s';

alter table public.attendance_sessions
  add column if not exists handover_photo boolean not null default false;

comment on column public.attendance_sessions.handover_photo is
  'Meja ambil bagasi: petugas boleh memotret koper yang diserahkan (opsional per peserta).';

alter table public.luggage_drops
  add column if not exists handover_photo_path text;

alter table public.luggage_drops drop constraint if exists luggage_drops_handover_photo_path_check;
alter table public.luggage_drops add constraint luggage_drops_handover_photo_path_check check (
  handover_photo_path is null
  or (handed_over_at is not null
      and handover_photo_path ~ '^[0-9a-f-]{36}/[0-9]+-[0-9a-f-]{36}-[0-9a-f-]{36}\.(jpg|webp)$')
);

comment on column public.luggage_drops.handover_photo_path is
  'Foto serah terima di meja ambil (bucket privat luggage-photos). Hanya ada selama handed_over_at terisi.';

notify pgrst, 'reload schema';

commit;
