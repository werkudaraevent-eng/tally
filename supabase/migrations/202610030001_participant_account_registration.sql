-- ---------------------------------------------------------------------------
-- Daftar = buat akun peserta.
--
-- Bila area peserta menyala, formulir pendaftaran meminta kata sandi dan akun
-- dibuat saat pendaftaran masuk. Pada acara bermoderasi baris `participants`
-- baru ada setelah panitia menyetujui, jadi akun kini boleh menunjuk ke
-- PENDAFTARAN dulu (`registration_id`) dan baru mendapat `participant_id` saat
-- disetujui. Pemicu di bawah yang mengisinya, apa pun jalur persetujuannya
-- (setujui otomatis di submit_event_registration, atau tombol Setujui panitia).
--
-- Kode peserta tidak lagi dipakai untuk membuat kata sandi. Gantinya tautan
-- sekali pakai lewat email (`participant_account_tokens`), yang juga menjadi
-- bukti pemilik email: tautan konfirmasi mengisi `email_verified_at`, dan
-- tautan buat/atur ulang kata sandi juga mengisinya, karena membukanya berarti
-- memegang kotak masuk itu.
--
-- Tabel `participant_accounts` belum punya baris di produksi saat migrasi ini
-- ditulis (2 Okt 2026), jadi tidak ada data lama yang perlu diisi ulang.
-- ---------------------------------------------------------------------------

alter table public.participant_accounts
  alter column participant_id drop not null;

alter table public.participant_accounts
  add column if not exists registration_id uuid references public.event_registrations(id) on delete cascade,
  add column if not exists email_verified_at timestamptz;

alter table public.participant_accounts
  drop constraint if exists participant_accounts_registration_unique;
alter table public.participant_accounts
  add constraint participant_accounts_registration_unique unique (registration_id);

alter table public.participant_accounts
  drop constraint if exists participant_accounts_target;
alter table public.participant_accounts
  add constraint participant_accounts_target check (participant_id is not null or registration_id is not null);

comment on column public.participant_accounts.registration_id is
  'Pendaftaran asal akun. Terisi bila akun dibuat dari formulir pendaftaran; participant_id menyusul saat disetujui.';
comment on column public.participant_accounts.email_verified_at is
  'Kapan pemilik membuka tautan dari email (konfirmasi atau buat kata sandi). Null = belum terbukti.';

-- Persetujuan menautkan akun ke peserta yang baru dibuat.
create or replace function public.link_participant_account_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.participant_id is not null and new.participant_id is distinct from old.participant_id then
    update public.participant_accounts
       set participant_id = new.participant_id
     where registration_id = new.id
       and participant_id is null;
  end if;
  return new;
end;
$$;

revoke all on function public.link_participant_account_on_approval() from public, anon, authenticated;

drop trigger if exists event_registrations_link_account on public.event_registrations;
create trigger event_registrations_link_account
  after update of participant_id on public.event_registrations
  for each row execute function public.link_participant_account_on_approval();

-- Tautan sekali pakai dari email.
--   konfirmasi: membuktikan email (berlaku 14 hari)
--   sandi:      membuat atau mengganti kata sandi (berlaku 60 menit)
-- Sasarannya satu dari tiga: akun yang sudah ada, peserta tanpa akun (impor
-- panitia), atau pendaftaran tanpa akun (mendaftar sebelum fitur ini).
create table if not exists public.participant_account_tokens (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  purpose          text not null check (purpose in ('konfirmasi', 'sandi')),
  -- sha256 heksadesimal; token mentahnya hanya ada di email.
  token_hash       text not null,
  email            text not null check (email = lower(trim(email))),
  account_id       uuid references public.participant_accounts(id) on delete cascade,
  participant_id   uuid references public.participants(id) on delete cascade,
  registration_id  uuid references public.event_registrations(id) on delete cascade,
  expires_at       timestamptz not null,
  used_at          timestamptz,
  created_at       timestamptz not null default now(),
  constraint participant_account_tokens_hash_unique unique (token_hash),
  constraint participant_account_tokens_target check (
    account_id is not null or participant_id is not null or registration_id is not null
  )
);

create index if not exists participant_account_tokens_event_email_idx
  on public.participant_account_tokens (event_id, email, created_at desc);

alter table public.participant_account_tokens enable row level security;
revoke all on table public.participant_account_tokens from public, anon, authenticated;

comment on table public.participant_account_tokens is
  'Tautan email area peserta (konfirmasi email, buat/atur ulang kata sandi). Hanya sha256 token yang disimpan.';

-- Permintaan "Kirim tautan ke email", untuk batas per email dan per IP.
-- Dihitung per PERMINTAAN, termasuk email yang tidak terdaftar: menghitung
-- token saja (yang hanya dibuat untuk email cocok) membuat batas itu hanya
-- menggigit email terdaftar, sehingga jawabannya membocorkan siapa yang
-- terdaftar.
create table if not exists public.participant_link_requests (
  id          bigint generated always as identity primary key,
  event_id    uuid not null references public.events(id) on delete cascade,
  email       text not null,
  ip          text,
  created_at  timestamptz not null default now()
);

create index if not exists participant_link_requests_email_idx
  on public.participant_link_requests (event_id, email, created_at desc);
create index if not exists participant_link_requests_ip_idx
  on public.participant_link_requests (event_id, ip, created_at desc);

alter table public.participant_link_requests enable row level security;
revoke all on table public.participant_link_requests from public, anon, authenticated;

comment on table public.participant_link_requests is
  'Catatan permintaan tautan kata sandi area peserta, hanya untuk pembatasan laju.';
