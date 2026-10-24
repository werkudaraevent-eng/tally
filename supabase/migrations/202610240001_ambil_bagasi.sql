-- ============================================================================
-- Ambil bagasi: meja pengambilan yang tersambung ke catatan titip bagasi.
--
--   1. attendance_sessions.luggage_pickup: sesi tempat petugas MENYERAHKAN
--      bagasi (lobi hotel). Lawan dari records_luggage (meja titip). Satu sesi
--      hanya boleh salah satunya; admin memilihnya sebagai Off / Drop-off /
--      Pick-up.
--   2. luggage_drops.handed_over_at / handed_over_by: kapan dan oleh siapa
--      bagasi itu diserahkan kembali. Null = masih dititipkan.
--
-- Penyambungnya adalah PESERTA, bukan sesi: meja ambil menampilkan semua
-- catatan titip peserta itu di acara ini, dari meja titip mana pun. Tidak ada
-- pasangan sesi yang perlu diatur.
--
-- Kolom baru, tanpa fungsi baru, tanpa ubahan data. Satu transaksi, aman
-- dijalankan ulang. Kode yang memakainya merge SETELAH ini dijalankan: bila
-- kode masuk lebih dulu, simpan pilihan Pick-up di admin gagal dan meja ambil
-- tidak bisa menyerahkan; meja titip dan portal tetap berjalan.
-- ============================================================================

begin;
set local lock_timeout = '5s';

alter table public.attendance_sessions
  add column if not exists luggage_pickup boolean not null default false;

comment on column public.attendance_sessions.luggage_pickup is
  'Petugas menyerahkan bagasi yang dititipkan peserta (dari meja titip mana pun) setelah memindai di sesi ini.';

alter table public.attendance_sessions drop constraint if exists attendance_sessions_luggage_mode_check;
alter table public.attendance_sessions add constraint attendance_sessions_luggage_mode_check
  check (not (records_luggage and luggage_pickup));

alter table public.luggage_drops
  add column if not exists handed_over_at timestamptz,
  add column if not exists handed_over_by uuid references public.users(id) on delete set null;

alter table public.luggage_drops drop constraint if exists luggage_drops_handed_over_check;
alter table public.luggage_drops add constraint luggage_drops_handed_over_check
  check (handed_over_by is null or handed_over_at is not null);

notify pgrst, 'reload schema';

commit;
