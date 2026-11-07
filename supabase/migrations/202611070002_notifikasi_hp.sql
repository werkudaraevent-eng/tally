-- ---------------------------------------------------------------------------
-- Notifikasi HP peserta (Web Push).
--
-- push_subscriptions  = satu baris per perangkat yang mengizinkan notifikasi:
--                       alamat push dari peramban (endpoint) + dua kunci
--                       enkripsinya. Terikat ke akun area peserta; hilang
--                       bersama akunnya. Endpoint unik: perangkat yang sama
--                       mendaftar ulang menimpa barisnya sendiri.
-- web_push_keys       = pasangan kunci VAPID milik situs, SATU untuk semua
--                       acara (peramban mengikat langganan ke kunci ini).
--                       Dibuat sendiri oleh server saat pertama dipakai
--                       (src/lib/push/kunci.ts), jadi tidak ada env var.
--
-- Keduanya hanya dibaca service role: RLS menyala tanpa policy, hak
-- anon/authenticated dicabut. Kunci privat tidak pernah keluar dari server.
--
-- Saklar per acara ada di landing_config.member.push (jsonb), bawaan mati:
-- acara yang sudah ada tidak berubah. Kode aman sebelum migrasi ini: ajakan
-- notifikasi tidak muncul selama tabelnya belum ada.
--
-- Satu transaksi, aman dijalankan ulang.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  account_id       uuid not null references public.participant_accounts(id) on delete cascade,
  endpoint         text not null,
  p256dh           text not null,
  auth             text not null,
  -- "ios", "android", "desktop": hanya untuk ringkasan di CMS.
  platform         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_sent_at     timestamptz,
  constraint push_subscriptions_endpoint_unique unique (endpoint),
  constraint push_subscriptions_endpoint_check check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  constraint push_subscriptions_keys_check check (char_length(p256dh) between 40 and 200 and char_length(auth) between 10 and 100),
  constraint push_subscriptions_platform_check check (platform is null or platform in ('ios', 'android', 'desktop'))
);

create index if not exists push_subscriptions_event_account_idx
  on public.push_subscriptions (event_id, account_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;

comment on table public.push_subscriptions is
  'Notifikasi HP peserta: satu baris per perangkat yang mengizinkan Web Push. Service role saja.';

create table if not exists public.web_push_keys (
  kunci        text primary key default 'vapid',
  public_key   text not null,
  private_key  text not null,
  created_at   timestamptz not null default now(),
  constraint web_push_keys_satu check (kunci = 'vapid')
);

alter table public.web_push_keys enable row level security;
revoke all on table public.web_push_keys from public, anon, authenticated;

comment on table public.web_push_keys is
  'Kunci VAPID Web Push situs, satu baris, dibuat otomatis oleh server. Service role saja.';

commit;

notify pgrst, 'reload schema';
