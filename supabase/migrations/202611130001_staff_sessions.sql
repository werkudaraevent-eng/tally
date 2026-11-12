-- Sesi staf di server.
--
-- Sebelumnya cookie `tally_session` berisi `<user id>.<HMAC>`: tanda tangan tanpa
-- catatan di server. Cookie seperti itu tidak bisa dicabut. Keluar hanya
-- menghapusnya di satu browser, dan ganti PIN tidak mengeluarkan perangkat lain.
--
-- Sekarang cookie membawa token acak dan tabel ini menyimpan sha256-nya, sama
-- dengan participant_sessions. Keluar menghapus barisnya, ganti PIN menghapus
-- semua baris akun itu, dan "Keluar dari semua perangkat" menghapus semuanya.
--
-- Hanya service role yang membaca tabel ini (RLS aktif tanpa policy).

begin;
set local lock_timeout = '5s';

create table if not exists public.staff_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  -- sha256 heksadesimal dari token di cookie. Token mentahnya tidak disimpan.
  token_hash    text not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  constraint staff_sessions_token_unique unique (token_hash)
);

create index if not exists staff_sessions_user_idx on public.staff_sessions (user_id);
create index if not exists staff_sessions_expires_idx on public.staff_sessions (expires_at);

alter table public.staff_sessions enable row level security;
revoke all on table public.staff_sessions from public, anon, authenticated;
-- Eksplisit, seperti migrasi lain di repo: tanpa ini login bergantung pada
-- default privileges proyek, dan bila itu tidak ada semua staf terkunci.
grant select, insert, delete on table public.staff_sessions to service_role;

comment on table public.staff_sessions is
  'Sesi staf (cookie tally_session). Cookie membawa token acak; tabel menyimpan sha256-nya.';

commit;

notify pgrst, 'reload schema';

-- Pemeriksaan sesudah (jalankan terpisah, satu select). Sebelum migrasi semua
-- kolom bernilai false, bukan galat.
--
-- select
--   to_regclass('public.staff_sessions') is not null as tabel_ada,
--   coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.staff_sessions')), false) as rls_aktif,
--   coalesce((select not has_table_privilege('anon', to_regclass('public.staff_sessions'), 'select') from pg_class where oid = to_regclass('public.staff_sessions')), false) as anon_ditolak,
--   coalesce((select not has_table_privilege('authenticated', to_regclass('public.staff_sessions'), 'select') from pg_class where oid = to_regclass('public.staff_sessions')), false) as authenticated_ditolak,
--   coalesce((select has_table_privilege('service_role', to_regclass('public.staff_sessions'), 'select') from pg_class where oid = to_regclass('public.staff_sessions')), false) as service_role_select,
--   coalesce((select has_table_privilege('service_role', to_regclass('public.staff_sessions'), 'insert') from pg_class where oid = to_regclass('public.staff_sessions')), false) as service_role_insert,
--   coalesce((select has_table_privilege('service_role', to_regclass('public.staff_sessions'), 'delete') from pg_class where oid = to_regclass('public.staff_sessions')), false) as service_role_delete;
--
-- Rollback (HANYA bersama revert kode + redeploy: instans yang masih hangat
-- sudah mengingat "tabel ada" dan akan menolak semua cookie setelah tabel
-- dibuang):
--
-- begin; set local lock_timeout = '5s'; drop table if exists public.staff_sessions; commit; notify pgrst, 'reload schema';
