-- ============================================================================
-- Event report (Admin > Event report): deck laporan akhir acara untuk direksi.
--
-- event_reports: satu baris per acara.
--   config          pilihan panitia: slide yang disembunyikan, urutan, judul
--                   dan catatan yang diedit, kolom pengelompokan, slide
--                   tambahan (grafik dari pertanyaan, slide teks). Divalidasi
--                   aplikasi (src/lib/laporan/config.ts).
--   shared_snapshot isi deck yang dikunci saat "Share with client": angka
--                   dan teks jadi, tanpa nama peserta. Klien (Viewer) membaca
--                   ini, bukan data hidup.
--   shared_at       kapan terakhir dibagikan; null = belum pernah.
--
-- Hanya dibaca dan ditulis server (service role). Tidak ada fungsi, tidak ada
-- pemicu, tidak menyentuh tabel lain. Tabel baru saja: aman dijalankan ulang.
-- Kode yang memakainya aman sebelum ini dijalankan (halaman menampilkan
-- angka tanpa bisa menyimpan), dan merge SETELAH ini dijalankan.
--
-- Cek sesudah (false sebelum, true sesudah):
-- select coalesce((select c.relrowsecurity and not has_table_privilege('anon', c.oid, 'select,insert,update,delete') and not has_table_privilege('authenticated', c.oid, 'select,insert,update,delete') and has_table_privilege('service_role', c.oid, 'select,insert,update,delete') and (select count(*) from pg_constraint where conrelid = c.oid) = 7 from pg_class c where c.oid = to_regclass('public.event_reports')), false) as laporan_siap;
-- ============================================================================

begin;
set local lock_timeout = '5s';

create table if not exists public.event_reports (
  event_id uuid primary key references public.events(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  shared_snapshot jsonb,
  shared_at timestamptz,
  shared_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  constraint event_reports_config_check check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 100000),
  constraint event_reports_snapshot_check check (shared_snapshot is null or (jsonb_typeof(shared_snapshot) = 'object' and pg_column_size(shared_snapshot) <= 1000000)),
  constraint event_reports_shared_check check ((shared_snapshot is null) = (shared_at is null))
);

comment on table public.event_reports is
  'Event report (Admin > Event report): pilihan slide panitia (config) dan deck yang dikunci untuk klien (shared_snapshot). Satu baris per acara; tanpa baris = bawaan.';

alter table public.event_reports enable row level security;
revoke all on table public.event_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.event_reports to service_role;

commit;

notify pgrst, 'reload schema';
