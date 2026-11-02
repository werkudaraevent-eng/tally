-- ============================================================================
-- QR checkpoint tetap yang bisa dicetak (Check-in > Checkpoints > Checkpoint QR).
-- Diminta Hanung 2026-11-02: ada klien yang ingin QR checkpoint dicetak di
-- poster atau standee, bukan ditampilkan di layar yang berganti tiap 30 detik.
--
-- QR checkpoint milik satu sesi check-in (attendance_sessions), jadi pilihannya
-- disimpan di sesi itu. Tiga kolom:
--
--   checkpoint_qr             'rotating' (bawaan, seperti sebelumnya) atau
--                             'fixed' (satu kode untuk dicetak)
--   checkpoint_qr_version     nomor kode cetak, mulai 1. "Make a new code" di
--                             CMS menaikkannya, dan semua cetakan dengan nomor
--                             lama langsung ditolak.
--   checkpoint_qr_changed_at  kapan nomor itu dibuat; null = belum pernah diganti
--
-- Kodenya sendiri tidak disimpan: dihitung dari rahasia server, acara, sesi,
-- dan nomornya (lib/checkpoint/kode-qr.ts), sama dengan kode yang berganti.
--
-- Hanya menambah kolom dengan bawaan 'rotating' dan 1: setiap acara berubah
-- 0 px dan semua QR yang sedang tampil tetap berlaku. Tabel ini RLS tanpa
-- policy (service_role saja), dan itu berlaku untuk kolom baru. Satu
-- transaksi, aman dijalankan ulang.
--
-- Aman sebelum atau sesudah kodenya tayang: kode membaca sesi dengan select *
-- dan menganggap kolom yang belum ada sebagai 'rotating'; menyimpan 'fixed'
-- sebelum migrasi ini dijawab 409 CHECKPOINT_QR_NOT_READY.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.attendance_sessions
  add column if not exists checkpoint_qr text not null default 'rotating',
  add column if not exists checkpoint_qr_version integer not null default 1,
  add column if not exists checkpoint_qr_changed_at timestamptz;

alter table public.attendance_sessions drop constraint if exists attendance_sessions_checkpoint_qr_check;
alter table public.attendance_sessions
  add constraint attendance_sessions_checkpoint_qr_check
  check (checkpoint_qr in ('rotating', 'fixed'));

alter table public.attendance_sessions drop constraint if exists attendance_sessions_checkpoint_qr_version_check;
alter table public.attendance_sessions
  add constraint attendance_sessions_checkpoint_qr_version_check
  check (checkpoint_qr_version between 1 and 1000000);

comment on column public.attendance_sessions.checkpoint_qr is
  'QR checkpoint sesi ini: rotating = berganti tiap 30 detik (bawaan), fixed = satu kode yang bisa dicetak.';
comment on column public.attendance_sessions.checkpoint_qr_version is
  'Nomor kode QR checkpoint cetak. Dinaikkan oleh Make a new code; nomor lama ditolak.';
comment on column public.attendance_sessions.checkpoint_qr_changed_at is
  'Kapan nomor kode QR checkpoint cetak terakhir diganti. Null = belum pernah.';

notify pgrst, 'reload schema';

commit;
