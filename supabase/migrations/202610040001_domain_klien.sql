-- Domain klien untuk halaman acara (Pengaturan > Acara > Alamat halaman acara).
-- Aditif: satu tabel baru, satu kolom baru di message_blasts, satu job pg_cron.
-- Tidak mengubah baris yang ada.
--
-- event_domains           satu domain per acara. Statusnya:
--   menunggu    terdaftar di Vercel, menunggu DNS klien atau sertifikat HTTPS
--   aktif       Tally sudah membuka https://<domain> dan menemukan acara ini
--   bermasalah  pernah aktif, lalu 2 pemeriksaan berturut-turut gagal; tautan
--               email kembali ke alamat Tally
--   dilepas     admin melepasnya; domain tetap terpasang di Vercel dan
--               mengarahkan (308) ke alamat Tally sampai "Hapus permanen"
--   Hanya server (service role) yang membaca dan menulis tabel ini.
-- message_blasts.link_origin  asal tautan kiriman, DIBEKUKAN saat masuk
--   antrean. Ganti domain di tengah pengiriman tidak mencampur tautan.
-- tally-domain            pg_cron tiap 5 menit memanggil /api/cron/domain, hanya
--   bila ada domain menunggu (maks 72 jam) atau aktif/bermasalah. Memakai
--   rahasia Vault yang sama dengan tally-pesan (tally_site_url,
--   tally_cron_secret).
begin;

create table if not exists public.event_domains (
  event_id uuid primary key references public.events(id) on delete cascade,
  domain text not null unique
    check (domain = lower(domain) and char_length(domain) between 4 and 253 and domain ~ '^[a-z0-9.-]+$'),
  status text not null default 'menunggu'
    check (status in ('menunggu', 'aktif', 'bermasalah', 'dilepas')),
  -- Record DNS terakhir dari API Vercel dan diagnosis terakhir, untuk layar.
  records jsonb not null default '[]'::jsonb check (jsonb_typeof(records) = 'array'),
  problem text,
  fail_count integer not null default 0 check (fail_count >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  status_since timestamptz not null default now(),
  last_checked_at timestamptz,
  activated_at timestamptz,
  released_at timestamptz
);

alter table public.event_domains enable row level security;
revoke all on table public.event_domains from public, anon, authenticated;

alter table public.message_blasts
  add column if not exists link_origin text;

commit;

-- Penjadwal (di luar transaksi: cron.schedule mengganti job bernama sama).
select cron.schedule(
  'tally-domain',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'tally_site_url' limit 1) || '/api/cron/domain',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tally_cron_secret' limit 1),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'tally_site_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'tally_cron_secret')
      and exists (
        select 1 from public.event_domains
         where (status = 'menunggu' and created_at > now() - interval '72 hours')
            or status in ('aktif', 'bermasalah')
      );
  $job$
);
