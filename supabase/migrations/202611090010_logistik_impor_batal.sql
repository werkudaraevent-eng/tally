-- "Undo this import" untuk impor Hotel stays (Excel dan Read with AI).
--
-- logistics_imports: satu baris per impor Hotel stays yang tersimpan. `before`
-- dan `after` adalah keadaan kamar dan stay yang disentuh impor itu, sebelum
-- dan sesudah ditulis. Undo menulis `before` kembali, hanya untuk kamar dan
-- orang yang keadaannya masih sama dengan `after` (yang sudah diubah orang
-- lain sesudah impor dibiarkan dan disebut). Hanya impor terakhir yang belum
-- dibatalkan yang bisa di-undo.
--
-- ai_runs.status mendapat nilai 'undone', supaya halaman AI menghitung impor
-- AI yang dibatalkan.
--
-- Hanya service role: RLS menyala tanpa policy, anon/authenticated dicabut.

begin;
set local lock_timeout = '5s';

create table if not exists public.logistics_imports (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  kind text not null default 'stays' check (kind in ('stays')),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  ai_run_id bigint references public.ai_runs(id) on delete set null,
  before jsonb not null check (jsonb_typeof(before) = 'object'),
  after jsonb not null check (jsonb_typeof(after) = 'object'),
  undone_at timestamptz,
  undone_by uuid references public.users(id) on delete set null,
  undo_result jsonb check (undo_result is null or jsonb_typeof(undo_result) = 'object')
);

create index if not exists logistics_imports_event_created_idx on public.logistics_imports (event_id, created_at desc);

alter table public.logistics_imports enable row level security;
revoke all on table public.logistics_imports from public, anon, authenticated;
grant select, insert, update on table public.logistics_imports to service_role;

alter table public.ai_runs drop constraint if exists ai_runs_status_check;
alter table public.ai_runs add constraint ai_runs_status_check
  check (status in ('preview', 'saved', 'closed', 'failed', 'undone'));

commit;

notify pgrst, 'reload schema';
