-- ============================================================================
-- Info di lembar hasil pemindai petugas (Check-in > Sessions > Shown after scan).
--
-- attendance_sessions.scan_fields: daftar kunci info yang tampil di bawah nama
-- setelah petugas memindai QR peserta di sesi ini, urut seperti diatur panitia.
-- Bentuknya array teks JSON, paling banyak 4:
--
--   ["logistik:hotel", "logistik:vehicle", "extra:batch", "base:company"]
--
-- Null = belum diatur: lembar tetap menampilkan "Company · Title" seperti
-- sebelumnya. Nilai per peserta disusun server saat memindai (lib/info-scan.ts),
-- bukan di sini; kolom ini hanya pilihan panitia.
--
-- Kolom baru, tanpa fungsi baru, tanpa ubahan data. Satu transaksi, aman
-- dijalankan ulang. Kode yang memakainya merge SETELAH ini dijalankan: bila
-- kode masuk lebih dulu, simpan pilihan di admin gagal; pemindaian tetap jalan
-- (dibaca dengan select *, kolom yang belum ada = belum diatur).
-- ============================================================================

begin;
set local lock_timeout = '5s';

alter table public.attendance_sessions
  add column if not exists scan_fields jsonb;

alter table public.attendance_sessions drop constraint if exists attendance_sessions_scan_fields_check;
alter table public.attendance_sessions
  add constraint attendance_sessions_scan_fields_check
  check (scan_fields is null or (jsonb_typeof(scan_fields) = 'array' and jsonb_array_length(scan_fields) <= 4));

comment on column public.attendance_sessions.scan_fields is
  'Info di bawah nama pada hasil scan petugas di sesi ini, urut: base:<kolom>, extra:<kunci pertanyaan>, logistik:hotel|vehicle|train. Null = Company · Title. Paling banyak 4.';

notify pgrst, 'reload schema';

commit;
