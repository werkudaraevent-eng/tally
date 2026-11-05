-- ============================================================================
-- API keys per acara (Event settings > Integrations > API keys).
--
-- Satu baris per kunci. Kunci aslinya TIDAK disimpan: hanya sha256 hex-nya
-- (`key_hash`) dan beberapa huruf awal untuk dikenali di daftar
-- (`key_prefix`). Kunci tampil sekali saat dibuat, seperti Stripe dan GitHub.
--
-- `scopes` = izin kunci. Saat ini satu saja: 'room_numbers' (bot mengisi
-- nomor kamar, /api/bot/nomor-kamar). Daftar yang sah dijaga aplikasi DAN
-- check constraint di bawah, supaya izin baru harus sengaja ditambahkan.
--
-- Hanya dibaca dan ditulis server (service role). Tabel baru saja, tanpa
-- fungsi dan pemicu: aman dijalankan ulang. Kode yang memakainya merge
-- SETELAH ini dijalankan dan cek sesudahnya true.
-- ============================================================================

begin;
set local lock_timeout = '5s';

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  scopes text[] not null,
  key_prefix text not null,
  key_hash text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null,
  constraint api_keys_hash_unique unique (key_hash),
  constraint api_keys_name_check check (char_length(name) between 1 and 40 and name = btrim(name)),
  constraint api_keys_scopes_check check (cardinality(scopes) between 1 and 10 and scopes <@ array['room_numbers']::text[]),
  constraint api_keys_hash_check check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint api_keys_prefix_check check (char_length(key_prefix) between 4 and 16)
);

create index if not exists api_keys_event_idx on public.api_keys (event_id, created_at desc);

comment on table public.api_keys is
  'API keys per event (Event settings > Integrations > API keys). key_hash = sha256 hex of the key; the key itself is never stored.';

alter table public.api_keys enable row level security;
revoke all on table public.api_keys from public, anon, authenticated;
grant select, insert, update, delete on table public.api_keys to service_role;

commit;

notify pgrst, 'reload schema';
