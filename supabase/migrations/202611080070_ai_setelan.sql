-- AI untuk seluruh Tally (halaman /ai, super admin saja).
--
-- ai_settings: satu baris untuk seluruh workspace (global by design, seperti
-- users dan payment_methods), dikunci `id = true`. Kunci API disimpan sebagai
-- sandi AES-256-GCM yang dibuat server (src/lib/ai/kunci.ts); database tidak
-- pernah melihat kunci aslinya. Hanya 4 karakter terakhir yang dibaca halaman.
--
-- ai_runs: satu baris per pemakaian AI, untuk biaya per bulan, per acara, dan
-- per fitur, serta batas bulanan. Isi berkas TIDAK disimpan: hanya nama berkas,
-- jumlah token, biaya, dan hasilnya (disimpan, ditutup, gagal).
--
-- Keduanya hanya dibaca service role: RLS menyala tanpa policy, dan hak
-- anon/authenticated dicabut.

begin;
set local lock_timeout = '5s';

create table if not exists public.ai_settings (
  id boolean primary key default true check (id),
  provider text not null default 'anthropic' check (provider in ('anthropic')),
  api_key_cipher text,
  api_key_last4 text check (api_key_last4 is null or char_length(api_key_last4) <= 4),
  default_model text not null default 'claude-sonnet-5-5',
  feature_models jsonb not null default '{}'::jsonb check (jsonb_typeof(feature_models) = 'object'),
  features_off text[] not null default '{}',
  monthly_limit_usd numeric(10, 2) not null default 20 check (monthly_limit_usd >= 0 and monthly_limit_usd <= 10000),
  key_checked_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

create table if not exists public.ai_runs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event_id uuid references public.events(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  feature text not null check (char_length(feature) between 1 and 60),
  model text not null check (char_length(model) between 1 and 80),
  file_names text[] not null default '{}',
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  status text not null default 'preview' check (status in ('preview', 'saved', 'closed', 'failed')),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  updated_at timestamptz not null default now()
);

create index if not exists ai_runs_created_at_idx on public.ai_runs (created_at desc);
create index if not exists ai_runs_event_created_idx on public.ai_runs (event_id, created_at desc);

alter table public.ai_settings enable row level security;
alter table public.ai_runs enable row level security;
revoke all on table public.ai_settings from public, anon, authenticated;
revoke all on table public.ai_runs from public, anon, authenticated;
grant select, insert, update on table public.ai_settings to service_role;
grant select, insert, update on table public.ai_runs to service_role;

insert into public.ai_settings (id) values (true) on conflict (id) do nothing;

commit;

notify pgrst, 'reload schema';
