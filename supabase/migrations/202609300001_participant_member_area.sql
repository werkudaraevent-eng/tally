-- ---------------------------------------------------------------------------
-- Area peserta: akun email + kata sandi per acara, dan sesinya.
--
-- Terpisah dari `users` (akun panitia) dengan sengaja. Peserta dan panitia
-- tidak pernah berbagi tabel akun: satu salah cabang di pemeriksaan peran akan
-- membuat peserta masuk ke layar admin, dan pemisahan tabel membuat kesalahan
-- itu tidak mungkin terjadi sejak awal.
--
-- Akun terikat pada SATU baris peserta di SATU acara. Orang yang sama di dua
-- acara punya dua akun; area peserta memang hanya bermakna di dalam satu acara.
--
-- Kata sandi dibuat peserta sendiri lewat email pendaftaran + kode peserta
-- (kode QR di undangan). Pengiriman email aktivasi belum ada karena server
-- belum punya pengirim email; jalurnya ditambahkan kemudian tanpa mengubah
-- tabel ini.
--
-- Sesi disimpan di database, bukan di cookie bertanda tangan. Alasannya satu:
-- peserta yang mengganti kata sandi harus bisa mengeluarkan semua perangkat
-- lain, dan cookie bertanda tangan tidak bisa ditarik kembali.
--
-- Akses hanya lewat service role, sama seperti tabel lain.
-- ---------------------------------------------------------------------------

create table if not exists public.participant_accounts (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  participant_id   uuid not null references public.participants(id) on delete cascade,
  -- Disimpan huruf kecil. Pencocokan selalu memakai lower(trim(email)).
  email            text not null,
  password_hash    text not null,
  password_set_at  timestamptz not null default now(),
  last_login_at    timestamptz,
  created_at       timestamptz not null default now(),
  constraint participant_accounts_participant_unique unique (participant_id),
  constraint participant_accounts_email_lower check (email = lower(trim(email)))
);

create unique index if not exists participant_accounts_event_email_unique
  on public.participant_accounts (event_id, email);

alter table public.participant_accounts enable row level security;
revoke all on table public.participant_accounts from public, anon, authenticated;

comment on table public.participant_accounts is
  'Akun area peserta: satu per peserta per acara, email + kata sandi (bcrypt).';

create table if not exists public.participant_sessions (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.participant_accounts(id) on delete cascade,
  -- sha256 heksadesimal dari token acak di cookie. Token mentahnya tidak pernah
  -- disimpan, jadi isi tabel ini tidak bisa dipakai untuk masuk.
  token_hash    text not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_seen_at  timestamptz not null default now(),
  constraint participant_sessions_token_unique unique (token_hash)
);

create index if not exists participant_sessions_account_idx
  on public.participant_sessions (account_id);
create index if not exists participant_sessions_expires_idx
  on public.participant_sessions (expires_at);

alter table public.participant_sessions enable row level security;
revoke all on table public.participant_sessions from public, anon, authenticated;

comment on table public.participant_sessions is
  'Sesi area peserta. Cookie membawa token acak; tabel menyimpan sha256-nya.';

-- Pencarian peserta per email saat aktivasi. participants.email tidak unik dan
-- sebelumnya tidak berindeks.
create index if not exists participants_event_email_lower_idx
  on public.participants (event_id, lower(email))
  where email is not null;
