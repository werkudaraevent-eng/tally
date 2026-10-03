-- ---------------------------------------------------------------------------
-- Pesan peserta: kiriman undangan dan kabar lewat email (dan nanti WhatsApp).
--
-- Satu mesin kirim untuk semua pintu masuk: menu Pesan peserta, "Kirim
-- undangan masuk" di Logistik, dan pilihan baris di Daftar peserta. Setiap
-- kiriman (`message_blasts`) dipecah menjadi satu baris per peserta per saluran
-- (`message_blast_recipients`), dan baris itulah yang diantre, diklaim,
-- dikirim, lalu diperbarui oleh webhook penyedia.
--
-- Pengaman kiriman ganda ada di tiga lapis:
--   1. Giliran (`message_drain_turn`): hanya satu putaran pengirim yang jalan
--      pada satu waktu, apa pun pemicunya (tombol Kirim, pg_cron, cron-job.org).
--      Bukan pg_try_advisory_lock: PostgREST memakai koneksi berkumpul, dan kunci
--      sesi yang diambil lewat satu RPC tidak dijamin dilepas di koneksi yang
--      sama. Giliran berbatas waktu ini tetap lepas sendiri bila pengirimnya mati.
--   2. Klaim baris (`claim_email_chunk`, `claim_whatsapp_rows`): baris diubah
--      dari `antre` ke `mengirim` dengan `for update skip locked` SEBELUM
--      penyedia dipanggil.
--   3. Kunci idempotensi Resend per potongan 100 email (`chunk` tetap sejak
--      diantre). Potongan yang klaimnya kedaluwarsa dikirim ulang dengan kunci
--      yang sama, dan Resend membalas hasil yang lama alih-alih mengirim lagi.
--      WhatsApp tidak punya kunci serupa, jadi baris WA yang klaimnya
--      kedaluwarsa menjadi `tidak_pasti` dan tidak pernah dikirim ulang otomatis.
--
-- Akses hanya lewat service role, sama dengan tabel #49 dan #52.
-- ---------------------------------------------------------------------------

-- Izin dan keadaan alamat per peserta --------------------------------------

alter table public.participants
  add column if not exists wa_opt_in_at timestamptz,
  add column if not exists wa_opt_in_source text,
  add column if not exists wa_opt_out_at timestamptz,
  add column if not exists email_opt_out_at timestamptz,
  add column if not exists email_invalid_at timestamptz,
  add column if not exists wa_invalid_at timestamptz;

alter table public.participants drop constraint if exists participants_wa_opt_in_source_check;
alter table public.participants
  add constraint participants_wa_opt_in_source_check
  check (wa_opt_in_source is null or wa_opt_in_source in ('formulir', 'impor_ditegaskan'));

comment on column public.participants.wa_opt_in_at is
  'Kapan peserta setuju dihubungi lewat WhatsApp. Null = belum ada catatan izin.';
comment on column public.participants.wa_opt_in_source is
  'formulir = dicentang sendiri di formulir pendaftaran; impor_ditegaskan = panitia menegaskan izin dari klien saat mengirim.';
comment on column public.participants.email_opt_out_at is
  'Peserta berhenti menerima kiriman email untuk acara ini (tautan berhenti, atau laporan spam).';
comment on column public.participants.email_invalid_at is
  'Email peserta memantul permanen. Dilewati di kiriman berikutnya sampai alamatnya diubah.';

-- Kiriman ------------------------------------------------------------------

create table if not exists public.message_blasts (
  id                       uuid primary key default gen_random_uuid(),
  event_id                 uuid not null references public.events(id) on delete cascade,
  title                    text not null default 'Kiriman baru' check (char_length(title) between 1 and 120),
  -- undangan = membawa tautan masuk 7 hari; info = kabar biasa.
  kind                     text not null default 'undangan' check (kind in ('undangan', 'info')),
  channel                  text not null default 'email' check (channel in ('email', 'whatsapp', 'keduanya')),
  -- {"jenis": "semua" | "belum_masuk" | "manual", "perusahaan": [..], "ids": [..], "label": ".."}
  audience                 jsonb not null default '{"jenis": "semua"}'::jsonb,
  email_subject            text not null default '',
  email_body               text not null default '',
  wa_template              text,
  wa_language              text,
  wa_category              text,
  status                   text not null default 'draf'
                             check (status in ('draf', 'terjadwal', 'mengirim', 'selesai', 'dibatalkan')),
  scheduled_at             timestamptz,
  -- Alamat situs saat Kirim ditekan. Tautan di email disusun dari sini, karena
  -- pengirim yang dijalankan pg_cron tidak punya permintaan untuk dibaca.
  site_origin              text,
  sent_at                  timestamptz,
  finished_at              timestamptz,
  wa_consent_confirmed_by  uuid references public.users(id) on delete set null,
  wa_consent_confirmed_at  timestamptz,
  wa_consent_count         integer,
  created_by               uuid references public.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists message_blasts_event_idx on public.message_blasts (event_id, created_at desc);
create index if not exists message_blasts_status_idx on public.message_blasts (status, scheduled_at)
  where status in ('terjadwal', 'mengirim');

alter table public.message_blasts enable row level security;
revoke all on table public.message_blasts from public, anon, authenticated;

comment on table public.message_blasts is
  'Kiriman email/WhatsApp panitia ke peserta (menu Pesan peserta).';

create table if not exists public.message_blast_recipients (
  id              bigint generated always as identity primary key,
  blast_id        uuid not null references public.message_blasts(id) on delete cascade,
  event_id        uuid not null references public.events(id) on delete cascade,
  participant_id  uuid references public.participants(id) on delete set null,
  channel         text not null check (channel in ('email', 'whatsapp')),
  -- Email huruf kecil atau nomor +62...; null bila dilewati karena tidak punya.
  address         text,
  name            text not null default '',
  status          text not null default 'antre' check (status in (
                    'antre', 'mengirim', 'terkirim', 'diterima', 'dibaca',
                    'tidak_pasti', 'gagal_sementara', 'gagal_tetap', 'dilewati')),
  reason_code     text,
  reason          text,
  provider_id     text,
  -- Potongan kiriman email (100 per potongan), tetap sejak diantre: bagian dari
  -- kunci idempotensi Resend.
  chunk           integer,
  attempts        integer not null default 0,
  locked_until    timestamptz,
  queued_at       timestamptz not null default now(),
  sent_at         timestamptz,
  delivered_at    timestamptz,
  read_at         timestamptz,
  failed_at       timestamptz,
  updated_at      timestamptz not null default now(),
  constraint message_blast_recipients_unique unique (blast_id, participant_id, channel)
);

create index if not exists message_blast_recipients_blast_idx
  on public.message_blast_recipients (blast_id, status);
create index if not exists message_blast_recipients_queue_idx
  on public.message_blast_recipients (channel, status, locked_until)
  where status in ('antre', 'mengirim');
create index if not exists message_blast_recipients_provider_idx
  on public.message_blast_recipients (provider_id)
  where provider_id is not null;

alter table public.message_blast_recipients enable row level security;
revoke all on table public.message_blast_recipients from public, anon, authenticated;

comment on table public.message_blast_recipients is
  'Satu baris per peserta per saluran per kiriman: antrean, status kirim, dan alasan gagal.';

-- Tautan undangan 7 hari ---------------------------------------------------
-- Memakai tabel tautan #49. Undangan berperilaku seperti tautan `sandi`
-- (membuka halaman buat kata sandi, dipakai sekali), hanya masa berlakunya 7
-- hari. Undangan baru mencabut undangan lama yang belum dipakai dengan
-- memajukan `expires_at`, jadi tidak perlu kolom pencabutan.

alter table public.participant_account_tokens
  drop constraint if exists participant_account_tokens_purpose_check;
alter table public.participant_account_tokens
  add constraint participant_account_tokens_purpose_check
  check (purpose in ('konfirmasi', 'sandi', 'undangan'));

alter table public.participant_account_tokens
  add column if not exists blast_id uuid references public.message_blasts(id) on delete set null;

create index if not exists participant_account_tokens_participant_idx
  on public.participant_account_tokens (participant_id, purpose)
  where participant_id is not null;

-- Giliran pengirim -----------------------------------------------------------

create table if not exists public.message_drain_turn (
  id            boolean primary key default true check (id),
  locked_until  timestamptz not null default 'epoch'
);
insert into public.message_drain_turn (id) values (true) on conflict (id) do nothing;

alter table public.message_drain_turn enable row level security;
revoke all on table public.message_drain_turn from public, anon, authenticated;

-- Mengambil giliran selama p_seconds. Benar = giliran didapat.
create or replace function public.take_message_drain_turn(p_seconds integer)
returns boolean
language sql
security definer
set search_path = public
as $$
  with diambil as (
    update public.message_drain_turn
       set locked_until = now() + make_interval(secs => p_seconds)
     where id and locked_until < now()
    returning 1
  )
  select exists (select 1 from diambil);
$$;

create or replace function public.release_message_drain_turn()
returns void
language sql
security definer
set search_path = public
as $$
  update public.message_drain_turn set locked_until = 'epoch' where id;
$$;

-- Klaim satu potongan email. Potongan yang klaimnya kedaluwarsa (pengirimnya
-- mati sebelum mencatat hasil) diklaim lagi dengan isi yang sama, dalam 24 jam
-- masa kunci idempotensi Resend. Lewat dari itu, barisnya menjadi tidak_pasti
-- (lihat sweep_message_recipients).
create or replace function public.claim_email_chunk(p_lease_seconds integer)
returns setof public.message_blast_recipients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blast uuid;
  v_chunk integer;
begin
  select r.blast_id, r.chunk
    into v_blast, v_chunk
    from public.message_blast_recipients r
    join public.message_blasts b on b.id = r.blast_id
   where r.channel = 'email'
     and b.status = 'mengirim'
     and (r.status = 'antre' or (r.status = 'mengirim' and r.locked_until < now()))
   order by b.sent_at nulls last, r.blast_id, r.chunk
   limit 1
   for update of r skip locked;

  if v_blast is null then
    return;
  end if;

  return query
    update public.message_blast_recipients r
       set status = 'mengirim',
           locked_until = now() + make_interval(secs => p_lease_seconds),
           attempts = r.attempts + 1,
           updated_at = now()
     where r.blast_id = v_blast
       and r.chunk = v_chunk
       and r.channel = 'email'
       and (r.status = 'antre' or (r.status = 'mengirim' and r.locked_until < now()))
    returning r.*;
end;
$$;

create or replace function public.claim_whatsapp_rows(p_limit integer, p_lease_seconds integer)
returns setof public.message_blast_recipients
language sql
security definer
set search_path = public
as $$
  update public.message_blast_recipients r
     set status = 'mengirim',
         locked_until = now() + make_interval(secs => p_lease_seconds),
         attempts = r.attempts + 1,
         updated_at = now()
   where r.id in (
     select r2.id
       from public.message_blast_recipients r2
       join public.message_blasts b on b.id = r2.blast_id
      where r2.channel = 'whatsapp'
        and r2.status = 'antre'
        and b.status = 'mengirim'
      order by b.sent_at nulls last, r2.id
      limit p_limit
      for update of r2 skip locked
   )
  returning r.*;
$$;

-- Penyapu, dijalankan di awal setiap putaran:
--   * WA yang klaimnya kedaluwarsa -> tidak_pasti (mungkin sudah terkirim).
--   * Email yang klaimnya kedaluwarsa lebih dari 23 jam -> tidak_pasti (kunci
--     idempotensi Resend hanya berlaku 24 jam).
--   * Kiriman terjadwal yang waktunya tiba -> mengirim.
--   * Kiriman yang tidak punya baris antre/mengirim lagi -> selesai.
create or replace function public.sweep_message_recipients()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.message_blast_recipients
     set status = 'tidak_pasti', reason_code = 'lease_expired',
         reason = 'Pengirim berhenti sebelum penyedia membalas. Pesan mungkin sudah terkirim.',
         updated_at = now()
   where status = 'mengirim'
     and locked_until < now()
     and (channel = 'whatsapp' or locked_until < now() - interval '23 hours');

  update public.message_blasts
     set status = 'mengirim', sent_at = coalesce(sent_at, now()), updated_at = now()
   where status = 'terjadwal' and scheduled_at <= now();

  update public.message_blasts b
     set status = 'selesai', finished_at = now(), updated_at = now()
   where b.status = 'mengirim'
     and not exists (
       select 1 from public.message_blast_recipients r
        where r.blast_id = b.id and r.status in ('antre', 'mengirim')
     );
end;
$$;

revoke all on function public.take_message_drain_turn(integer) from public, anon, authenticated;
revoke all on function public.release_message_drain_turn() from public, anon, authenticated;
revoke all on function public.claim_email_chunk(integer) from public, anon, authenticated;
revoke all on function public.claim_whatsapp_rows(integer, integer) from public, anon, authenticated;
revoke all on function public.sweep_message_recipients() from public, anon, authenticated;

-- Mencatat hasil satu potongan sekaligus. p_rows: [{"id", "status", "provider_id",
-- "reason_code", "reason"}]. Hanya baris yang masih `mengirim` yang diubah, jadi
-- hasil yang datang terlambat tidak menimpa status dari webhook.
create or replace function public.record_message_results(p_rows jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.message_blast_recipients r
     set status = x.status,
         provider_id = coalesce(x.provider_id, r.provider_id),
         reason_code = x.reason_code,
         reason = x.reason,
         locked_until = null,
         sent_at = case when x.status = 'terkirim' then now() else r.sent_at end,
         failed_at = case when x.status in ('gagal_tetap', 'gagal_sementara', 'tidak_pasti') then now() else r.failed_at end,
         updated_at = now()
    from jsonb_to_recordset(p_rows) as x(id bigint, status text, provider_id text, reason_code text, reason text)
   where r.id = x.id
     and r.status = 'mengirim';
$$;

-- Status dari webhook penyedia. Hanya maju (antre < mengirim < terkirim <
-- diterima < dibaca); webhook bisa datang tidak berurutan. Gagal bersifat akhir
-- dan menimpa status apa pun kecuali dibaca.
create or replace function public.apply_message_event(
  p_provider_id text, p_status text, p_reason_code text, p_reason text, p_at timestamptz
)
returns setof public.message_blast_recipients
language sql
security definer
set search_path = public
as $$
  update public.message_blast_recipients r
     set status = p_status,
         reason_code = coalesce(p_reason_code, r.reason_code),
         reason = coalesce(p_reason, r.reason),
         delivered_at = case when p_status = 'diterima' then coalesce(r.delivered_at, p_at) else r.delivered_at end,
         read_at = case when p_status = 'dibaca' then coalesce(r.read_at, p_at) else r.read_at end,
         failed_at = case when p_status in ('gagal_tetap', 'gagal_sementara') then p_at else r.failed_at end,
         updated_at = now()
   where r.provider_id = p_provider_id
     and (
       case p_status
         when 'diterima' then r.status in ('mengirim', 'terkirim', 'tidak_pasti')
         when 'dibaca' then r.status in ('mengirim', 'terkirim', 'diterima', 'tidak_pasti')
         when 'gagal_tetap' then r.status in ('mengirim', 'terkirim', 'diterima', 'tidak_pasti', 'gagal_sementara')
         when 'gagal_sementara' then r.status in ('mengirim', 'terkirim', 'tidak_pasti')
         else false
       end
     )
  returning r.*;
$$;

-- "Kirim ulang yang bisa dicoba": hanya gagal_sementara. Diberi nomor potongan
-- baru (melanjutkan yang terbesar), jadi kunci idempotensinya baru dan Resend
-- benar-benar mengirim lagi.
create or replace function public.requeue_message_failures(p_blast uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_awal integer;
  v_jumlah integer;
begin
  select coalesce(max(chunk), -1) + 1 into v_awal
    from public.message_blast_recipients where blast_id = p_blast;

  with urut as (
    select id, row_number() over (order by id) - 1 as nomor
      from public.message_blast_recipients
     where blast_id = p_blast and status = 'gagal_sementara'
  )
  update public.message_blast_recipients r
     set status = 'antre', chunk = v_awal + (u.nomor / 100)::integer,
         locked_until = null, reason_code = null, reason = null, updated_at = now()
    from urut u
   where r.id = u.id;
  get diagnostics v_jumlah = row_count;

  if v_jumlah > 0 then
    update public.message_blasts
       set status = 'mengirim', finished_at = null, updated_at = now()
     where id = p_blast and status in ('selesai', 'mengirim');
  end if;
  return v_jumlah;
end;
$$;

revoke all on function public.record_message_results(jsonb) from public, anon, authenticated;
revoke all on function public.apply_message_event(text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.requeue_message_failures(uuid) from public, anon, authenticated;

-- Penjadwal ------------------------------------------------------------------
-- pg_cron tiap menit memanggil /api/cron/pesan, tetapi HANYA bila ada pekerjaan
-- (kiriman yang sedang berjalan atau terjadwal yang waktunya tiba). Tombol Kirim
-- di admin sudah memulai pengiriman sendiri; job ini jaring pengaman dan
-- pelaksana "Jadwalkan".
--
-- Alamat situs dan CRON_SECRET dibaca dari Supabase Vault. Isi keduanya SEKALI
-- sebelum atau sesudah menjalankan berkas ini (ganti teks dalam <...>):
--
--   select vault.create_secret('https://eventhub.werkudara.group', 'tally_site_url');
--   select vault.create_secret('<nilai CRON_SECRET di Vercel>', 'tally_cron_secret');
--
-- Selama keduanya belum ada, job berjalan tanpa memanggil apa pun.

create extension if not exists pg_net;

select cron.schedule(
  'tally-pesan',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'tally_site_url' limit 1) || '/api/cron/pesan',
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
        select 1 from public.message_blasts
         where status = 'mengirim' or (status = 'terjadwal' and scheduled_at <= now())
      );
  $job$
);
