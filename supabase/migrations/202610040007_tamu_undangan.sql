-- Tamu undangan: daftar orang yang diundang tapi belum terdaftar, tautan
-- pribadi ke formulir pendaftaran, dan kiriman Invitation lewat Pesan peserta.
-- Desain: /mnt/project-files/pesan-peserta/undangan-tamu/rekomendasi.md.
--
-- Aditif. Tidak mengubah baris yang ada; acara lama tetap "terbuka" dan
-- pendaftarannya berjalan seperti sebelumnya.
--
--   events.registration_access     'terbuka' | 'undangan' (Hanya tamu undangan)
--   events.invitation_auto_approve tamu yang mendaftar lewat tautannya, dengan
--                                  email yang diundang, langsung disetujui
--   event_invitations              daftar tamu (hanya server)
--   event_email_suppressions       penekanan per acara, hash email berpepper
--   invitation_rate_events         jejak untuk batas kirim ulang dan token salah
--   message_blast_recipients       + invitation_id, + status 'ditahan'
--   message_blasts                 + kind 'invitation', + status 'dijeda',
--                                  + hold_until, paused_reason, gate_cleared_at
--   submit_event_registration      + p_invitation_id (versi 9 argumen dibuang)
--   import_event_invitations       impor coba-dulu / simpan, satu fungsi
--   enqueue_invitation_recipients  antre baris tamu (indeks unik parsial)
--   evaluate_invitation_gates      mulai pelan: lepas sisa atau jeda
--   purge_event_invitations        hapus tamu yang tidak menjadi peserta, 30
--                                  hari setelah acara (pg_cron harian)
--   duplicate_event                ikut menyalin registration_access dan
--                                  invitation_auto_approve
--
-- Jalankan di luar jam ramai. Bila berhenti karena lock_timeout, jalankan
-- ulang: seluruh berkas aman dijalankan dua kali.
--
-- Bila kode dikembalikan ke versi sebelum fitur ini saat ada kiriman
-- Invitation berjalan, baris 'ditahan' membuat kirimannya tidak pernah
-- selesai. Tutup dengan:
--   update public.message_blast_recipients set status = 'dilewati',
--          reason_code = 'dibatalkan' where status = 'ditahan';
--   update public.message_blasts set status = 'dibatalkan'
--    where kind = 'invitation' and status in ('mengirim', 'dijeda');
begin;

-- Kunci eksklusif pada events dan tabel kiriman ditahan sampai commit: jangan
-- antre lama di belakang pembaca lain.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Setelan acara ------------------------------------------------------------

alter table public.events
  add column if not exists registration_access text not null default 'terbuka',
  add column if not exists invitation_auto_approve boolean not null default true;

alter table public.events drop constraint if exists events_registration_access_check;
alter table public.events
  add constraint events_registration_access_check check (registration_access in ('terbuka', 'undangan'));

comment on column public.events.registration_access is
  'terbuka = siapa saja yang punya tautan bisa mendaftar; undangan = hanya lewat tautan pribadi tamu undangan (ditegakkan di submit_event_registration).';
comment on column public.events.invitation_auto_approve is
  'Tamu yang mendaftar lewat tautan pribadinya dengan email yang diundang langsung disetujui. Terpisah dari registration_auto_approve.';

-- Tamu undangan -------------------------------------------------------------

create table if not exists public.event_invitations (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  email            text check (email is null or char_length(email) between 3 and 160),
  -- Bentuk yang dipakai untuk mencocokkan. Penormal di aplikasi
  -- (src/lib/undangan/email.ts) sudah membersihkan sebelum menyimpan; ini
  -- hanya menjaga huruf kecil dan spasi.
  email_norm       text generated always as (nullif(lower(btrim(email)), '')) stored,
  company          text check (company is null or char_length(company) <= 160),
  title            text check (title is null or char_length(title) <= 160),
  phone            text check (phone is null or char_length(phone) <= 30),
  -- Bagian dari tanda tangan tautan pribadi. Diganti = tautan lama mati.
  link_nonce       text not null default replace(gen_random_uuid()::text, '-', ''),
  -- "Membuka formulir" (perkiraan): dicatat sekali setelah ada interaksi nyata.
  link_opened_at   timestamptz,
  registration_id  uuid unique references public.event_registrations(id) on delete set null,
  -- Tetap terisi walau pendaftarannya dihapus: tautan yang sudah dipakai tidak
  -- hidup lagi, dan tamu tidak kembali ke "Belum daftar".
  registered_at    timestamptz,
  participant_id   uuid references public.participants(id) on delete set null,
  opted_out_at     timestamptz,
  email_invalid_at timestamptz,
  rejected_at      timestamptz,
  deleted_at       timestamptz,
  -- Impor dari situs uji (preview) ke acara draf.
  is_test          boolean not null default false,
  attested_by      uuid references public.users(id) on delete set null,
  attested_at      timestamptz,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists event_invitations_email_key
  on public.event_invitations (event_id, email_norm)
  where deleted_at is null and email_norm is not null;
create unique index if not exists event_invitations_participant_key
  on public.event_invitations (event_id, participant_id)
  where participant_id is not null;
create index if not exists event_invitations_event_idx
  on public.event_invitations (event_id, created_at)
  where deleted_at is null;

alter table public.event_invitations enable row level security;
revoke all on table public.event_invitations from public, anon, authenticated;

comment on table public.event_invitations is
  'Tamu undangan: orang yang diundang panitia tapi belum mendaftar. Hanya server (service role) yang membaca dan menulis.';

-- Penekanan per acara. Hash email berpepper (HMAC di server), jadi bertahan
-- walau undangan dihapus, diimpor ulang, atau dibersihkan 30 hari setelah
-- acara, tanpa menyimpan alamat aslinya.
create table if not exists public.event_email_suppressions (
  event_id   uuid not null references public.events(id) on delete cascade,
  email_hash text not null check (char_length(email_hash) between 20 and 100),
  reason     text not null check (reason in ('berhenti', 'memantul', 'spam')),
  created_at timestamptz not null default now(),
  primary key (event_id, email_hash)
);

alter table public.event_email_suppressions enable row level security;
revoke all on table public.event_email_suppressions from public, anon, authenticated;

-- Jejak untuk batas laju di halaman publik: permintaan kirim ulang undangan,
-- tautan undangan yang tandanya salah, dan penanda "membuka formulir".
create table if not exists public.invitation_rate_events (
  id         bigint generated always as identity primary key,
  event_id   uuid not null references public.events(id) on delete cascade,
  kind       text not null check (kind in ('kirim_ulang', 'token_salah', 'penanda')),
  email_hash text check (email_hash is null or char_length(email_hash) between 20 and 100),
  ip         text check (ip is null or char_length(ip) <= 45),
  created_at timestamptz not null default now()
);

create index if not exists invitation_rate_events_lookup_idx
  on public.invitation_rate_events (event_id, kind, created_at desc);

alter table public.invitation_rate_events enable row level security;
revoke all on table public.invitation_rate_events from public, anon, authenticated;
revoke all on sequence public.invitation_rate_events_id_seq from public, anon, authenticated;

-- Kiriman ---------------------------------------------------------------------

alter table public.message_blasts drop constraint if exists message_blasts_kind_check;
alter table public.message_blasts
  add constraint message_blasts_kind_check check (kind in ('undangan', 'info', 'invitation'));

alter table public.message_blasts drop constraint if exists message_blasts_status_check;
alter table public.message_blasts
  add constraint message_blasts_status_check
  check (status in ('draf', 'terjadwal', 'mengirim', 'dijeda', 'selesai', 'dibatalkan'));

alter table public.message_blasts
  -- Mulai pelan (Invitation): sisa penerima ditahan sampai waktu ini, lalu
  -- dinilai dari kabar pantulan dan laporan spam gelombang pertama.
  add column if not exists hold_until timestamptz,
  add column if not exists paused_reason text check (paused_reason is null or char_length(paused_reason) <= 300),
  -- Panitia menekan Lanjutkan, atau gelombang pertama lolos: tidak dinilai lagi.
  add column if not exists gate_cleared_at timestamptz;

alter table public.message_blast_recipients
  add column if not exists invitation_id uuid references public.event_invitations(id) on delete set null;

alter table public.message_blast_recipients drop constraint if exists message_blast_recipients_one_target;
alter table public.message_blast_recipients
  add constraint message_blast_recipients_one_target check (participant_id is null or invitation_id is null);

-- Indeks unik lama (blast_id, participant_id, channel) tidak menahan baris tamu
-- karena participant_id-nya null. Yang ini yang menahan.
create unique index if not exists message_blast_recipients_invitation_key
  on public.message_blast_recipients (blast_id, invitation_id, channel)
  where invitation_id is not null;
create index if not exists message_blast_recipients_invitation_idx
  on public.message_blast_recipients (invitation_id)
  where invitation_id is not null;

alter table public.message_blast_recipients drop constraint if exists message_blast_recipients_status_check;
alter table public.message_blast_recipients
  add constraint message_blast_recipients_status_check check (status in (
    'antre', 'ditahan', 'mengirim', 'terkirim', 'diterima', 'dibaca',
    'tidak_pasti', 'gagal_sementara', 'gagal_tetap', 'dilewati'));

-- Antre baris tamu. PostgREST tidak bisa memakai indeks unik parsial untuk
-- upsert, jadi lewat fungsi ini dengan `on conflict do nothing`.
create or replace function public.enqueue_invitation_recipients(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jumlah integer;
begin
  insert into public.message_blast_recipients
    (blast_id, event_id, invitation_id, channel, address, name, status, reason_code, reason, chunk)
  select x.blast_id, x.event_id, x.invitation_id, 'email', x.address, coalesce(x.name, ''),
         coalesce(x.status, 'antre'), x.reason_code, x.reason, x.chunk
    from jsonb_to_recordset(p_rows) as x(
      blast_id uuid, event_id uuid, invitation_id uuid, address text, name text,
      status text, reason_code text, reason text, chunk integer)
    -- Penahan: hanya undangan acara ini, ke kiriman Invitation acara ini.
    -- Tamu yang berhenti, memantul, atau sudah mendaftar hanya boleh masuk
    -- sebagai 'dilewati' (aplikasi yang menulis alasannya).
    join public.event_invitations i
      on i.id = x.invitation_id and i.event_id = x.event_id and i.deleted_at is null
    join public.message_blasts b
      on b.id = x.blast_id and b.event_id = x.event_id and b.kind = 'invitation'
   where coalesce(x.status, 'antre') in ('antre', 'ditahan', 'dilewati')
     and (coalesce(x.status, 'antre') = 'dilewati'
          or (i.opted_out_at is null and i.email_invalid_at is null
              and i.registered_at is null and i.rejected_at is null))
  on conflict (blast_id, invitation_id, channel) where invitation_id is not null do nothing;
  get diagnostics v_jumlah = row_count;
  return v_jumlah;
end;
$$;

-- Penyapu: sama dengan 202610030003, ditambah baris 'ditahan' yang membuat
-- kiriman belum selesai.
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
        where r.blast_id = b.id and r.status in ('antre', 'ditahan', 'mengirim')
     );
end;
$$;

-- Mulai pelan untuk Invitation. Dipanggil di awal setiap putaran pengirim.
--
--   * Ada laporan spam di kiriman Invitation yang belum dilepas -> dijeda.
--   * Waktu tahan habis (hold_until, dan paling cepat 15 menit setelah
--     kiriman benar-benar berangkat, supaya kiriman terjadwal tidak dinilai
--     sebelum mengirim apa pun) dan sudah ada cukup kabar (80% gelombang
--     pertama, paling sedikit 20, atau semuanya bila lebih sedikit):
--       pantulan keras >= 5% dan paling sedikit 2 -> dijeda; selain itu sisa
--       dilepas ke antrean.
--   * 45 menit setelah waktu tahan habis kabarnya belum cukup -> dijeda,
--     panitia yang memutuskan (webhook mungkin belum terpasang).
--
-- Dijeda = baris antre ikut ditahan dan kiriman berstatus 'dijeda'. Lanjutkan
-- (admin) melepasnya dan mengisi gate_cleared_at.
create or replace function public.evaluate_invitation_gates()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  v_gelombang integer;
  v_kabar integer;
  v_pantul integer;
  v_spam integer;
  v_perlu integer;
  v_alasan text;
  v_tahan timestamptz;
begin
  for b in
    select id, hold_until, sent_at from public.message_blasts
     where kind = 'invitation' and status = 'mengirim' and gate_cleared_at is null
     for update skip locked
  loop
    select count(*) filter (where status not in ('ditahan', 'dilewati')),
           count(*) filter (where status in ('diterima', 'dibaca', 'gagal_tetap')),
           count(*) filter (where reason_code in ('bounce', 'suppressed')),
           count(*) filter (where reason_code = 'complained')
      into v_gelombang, v_kabar, v_pantul, v_spam
      from public.message_blast_recipients
     where blast_id = b.id;

    v_alasan := null;
    v_tahan := greatest(coalesce(b.hold_until, '-infinity'::timestamptz),
                        coalesce(b.sent_at + interval '15 minutes', '-infinity'::timestamptz));
    if v_spam > 0 then
      v_alasan := 'Ada penerima yang menandai undangan sebagai spam. Periksa daftar dan isi sebelum melanjutkan.';
    elsif v_tahan > now() then
      continue;
    else
      v_perlu := least(v_gelombang, greatest(20, ceil(0.8 * v_gelombang)::integer));
      if v_kabar >= v_perlu and v_kabar > 0 then
        if v_pantul >= 2 and v_pantul::numeric / v_kabar >= 0.05 then
          v_alasan := format('%s dari %s undangan pertama memantul. Periksa sumber daftar sebelum melanjutkan.', v_pantul, v_kabar);
        else
          update public.message_blast_recipients
             set status = 'antre', updated_at = now()
           where blast_id = b.id and status = 'ditahan';
          update public.message_blasts
             set gate_cleared_at = now(), hold_until = null, updated_at = now()
           where id = b.id;
          continue;
        end if;
      elsif v_tahan < now() - interval '45 minutes' then
        v_alasan := 'Kabar pengiriman gelombang pertama belum cukup untuk menilai daftar ini. Periksa laporan, lalu lanjutkan bila aman.';
      else
        continue;
      end if;
    end if;

    update public.message_blast_recipients
       set status = 'ditahan', updated_at = now()
     where blast_id = b.id and status = 'antre';
    update public.message_blasts
       set status = 'dijeda', paused_reason = v_alasan, updated_at = now()
     where id = b.id;
  end loop;
end;
$$;

-- Lanjutkan kiriman yang dijeda (tombol admin).
drop function if exists public.resume_invitation_blast(uuid);
create or replace function public.resume_invitation_blast(p_event_id uuid, p_blast uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jumlah integer;
begin
  update public.message_blasts
     set status = 'mengirim', paused_reason = null, hold_until = null,
         gate_cleared_at = now(), updated_at = now()
   where id = p_blast and event_id = p_event_id and status = 'dijeda';
  if not found then
    return -1;
  end if;
  update public.message_blast_recipients
     set status = 'antre', updated_at = now()
   where blast_id = p_blast and status = 'ditahan';
  get diagnostics v_jumlah = row_count;
  return v_jumlah;
end;
$$;

revoke all on function public.enqueue_invitation_recipients(jsonb) from public, anon, authenticated;
revoke all on function public.sweep_message_recipients() from public, anon, authenticated;
revoke all on function public.evaluate_invitation_gates() from public, anon, authenticated;
revoke all on function public.resume_invitation_blast(uuid, uuid) from public, anon, authenticated;

-- Pendaftaran -------------------------------------------------------------------

-- Pendaftaran yang ditautkan ke undangan menyalin keputusan panitia ke
-- undangannya: disetujui -> participant_id; ditolak -> rejected_at (tautan
-- mati sampai panitia membuat tautan baru). Opt-out tamu ikut ke pesertanya.
create or replace function public.sync_invitation_from_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.participant_id is not null and new.participant_id is distinct from old.participant_id then
    update public.event_invitations
       set participant_id = new.participant_id, updated_at = now()
     where registration_id = new.id;
    update public.participants p
       set email_opt_out_at = coalesce(p.email_opt_out_at, i.opted_out_at)
      from public.event_invitations i
     where i.registration_id = new.id
       and i.opted_out_at is not null
       and p.id = new.participant_id;
  end if;
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    update public.event_invitations
       set rejected_at = coalesce(rejected_at, now()), updated_at = now()
     where registration_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists event_registrations_sync_invitation on public.event_registrations;
create trigger event_registrations_sync_invitation
  after update of status, participant_id on public.event_registrations
  for each row execute function public.sync_invitation_from_registration();

revoke all on function public.sync_invitation_from_registration() from public, anon, authenticated;

-- submit_event_registration dengan undangan. Ditulis ulang seutuhnya dari
-- 202608210001; yang baru:
--
--   * p_invitation_id: undangan yang tanda tangannya SUDAH diperiksa API.
--     Dikunci FOR UPDATE, jadi satu tautan tidak bisa dipakai dua kali
--     bersamaan. Harus milik acara ini, belum dihapus, belum dipakai, belum
--     ditolak.
--   * Email sama dengan yang diundang -> invitation_auto_approve. Email lain
--     -> selalu Menunggu, dan email_changed = true supaya API memberi tahu
--     pemilik undangan.
--   * Mode 'undangan' tanpa undangan -> REGISTRATION_INVITE_ONLY.
--   * Mode 'terbuka' tanpa tautan: email yang ada di daftar undangan
--     ditautkan ke undangannya, tetapi persetujuannya tetap mengikuti
--     setelan pendaftar umum (siapa pun bisa mengetik email orang lain).
drop function if exists public.submit_event_registration(uuid, text, text, text, text, text, jsonb, text, uuid[]);

create or replace function public.submit_event_registration(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_company text default null,
  p_job_title text default null,
  p_extra jsonb default '{}'::jsonb,
  p_ip text default null,
  p_upload_ids uuid[] default '{}'::uuid[],
  p_invitation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events;
  inv public.event_invitations;
  reg_id uuid;
  reg_token text;
  peserta_id uuid;
  kode text;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_cocok boolean := false;
  v_setuju boolean;
begin
  select * into ev from public.events where id = p_event_id;
  if ev.id is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if not ev.registration_enabled then
    raise exception 'REGISTRATION_CLOSED';
  end if;
  if ev.status not in ('draft', 'active') then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if p_invitation_id is not null then
    select * into inv from public.event_invitations
     where id = p_invitation_id and event_id = p_event_id and deleted_at is null
     for update;
    if inv.id is null or inv.registered_at is not null or inv.rejected_at is not null then
      raise exception 'INVITATION_USED';
    end if;
    -- Tidak pernah NULL: email kosong lewat tautan = email lain -> Menunggu.
    v_cocok := inv.email_norm is not null and v_email is not null and inv.email_norm = v_email;
    v_setuju := v_cocok and ev.invitation_auto_approve;
  elsif ev.registration_access = 'undangan' then
    raise exception 'REGISTRATION_INVITE_ONLY';
  else
    if v_email is not null then
      select * into inv from public.event_invitations
       where event_id = p_event_id and email_norm = v_email and deleted_at is null
         and registered_at is null and rejected_at is null
       for update skip locked;
    end if;
    v_setuju := ev.registration_auto_approve;
  end if;

  insert into public.event_registrations
    (event_id, name, email, phone, company, job_title, extra, submitted_ip)
  values
    (p_event_id, btrim(p_name), v_email,
     nullif(btrim(coalesce(p_phone, '')), ''),
     nullif(btrim(coalesce(p_company, '')), ''), nullif(btrim(coalesce(p_job_title, '')), ''),
     coalesce(p_extra, '{}'::jsonb), p_ip)
  returning id, access_token into reg_id, reg_token;

  if inv.id is not null then
    update public.event_invitations
       set registration_id = reg_id, registered_at = now(), updated_at = now()
     where id = inv.id;
  end if;

  if array_length(p_upload_ids, 1) is not null then
    update public.registration_uploads
       set registration_id = reg_id
     where id = any (p_upload_ids)
       and event_id = p_event_id
       and registration_id is null;
  end if;

  if not coalesce(v_setuju, false) then
    insert into public.audit_logs (event_id, action, payload)
    values (p_event_id, 'registration_submitted',
            jsonb_build_object('registration_id', reg_id, 'auto_approved', false,
                               'invitation_id', inv.id));
    return jsonb_build_object(
      'registration_id', reg_id, 'status', 'pending', 'qr_code', null,
      'access_token', reg_token, 'invitation_id', inv.id,
      'email_changed', p_invitation_id is not null and not v_cocok);
  end if;

  kode := public.generate_registration_qr(p_event_id);
  insert into public.participants (event_id, qr_code, name, company, title, email, phone, extra)
  values (p_event_id, kode, btrim(p_name),
          nullif(btrim(coalesce(p_company, '')), ''),
          nullif(btrim(coalesce(p_job_title, '')), ''),
          v_email,
          nullif(btrim(coalesce(p_phone, '')), ''),
          coalesce(p_extra, '{}'::jsonb))
  returning id into peserta_id;

  -- Memicu event_registrations_sync_invitation: undangan mendapat participant_id.
  update public.event_registrations
     set status = 'approved', participant_id = peserta_id, reviewed_at = now()
   where id = reg_id;

  insert into public.audit_logs (event_id, action, payload)
  values (p_event_id, 'registration_submitted',
          jsonb_build_object('registration_id', reg_id, 'auto_approved', true,
                             'participant_id', peserta_id, 'qr_code', kode,
                             'invitation_id', inv.id));

  return jsonb_build_object(
    'registration_id', reg_id, 'status', 'approved', 'qr_code', kode,
    'access_token', reg_token, 'invitation_id', inv.id, 'email_changed', false);
end $$;

revoke all on function public.submit_event_registration(uuid, text, text, text, text, text, jsonb, text, uuid[], uuid)
  from public, anon, authenticated;
grant execute on function public.submit_event_registration(uuid, text, text, text, text, text, jsonb, text, uuid[], uuid)
  to service_role;

-- Impor ---------------------------------------------------------------------------

-- Pencocokan "sudah jadi peserta" di impor memakai lower(btrim(email)); indeks
-- lama (event_id, lower(email)) tidak terpakai untuk ekspresi itu.
create index if not exists participants_event_email_norm_idx
  on public.participants (event_id, lower(btrim(email))) where source_removed_at is null;

-- Satu fungsi untuk coba dulu dan simpan: p_dry_run menjalankan semua tulisan
-- lalu membatalkannya, jadi hitungan pratinjau PERSIS hitungan penyimpanan.
--
-- p_rows sudah dinormalkan dan diperiksa di server aplikasi (nama ada, email
-- sah atau kosong): [{"row", "name", "email", "company", "title", "phone",
-- "email_hash"}]. email_hash = hash berpepper untuk mencocokkan penekanan.
--
-- Aturan:
--   * email sudah dipakai peserta aktif acara ini -> dilewati
--   * email sudah diundang, atau ganda di dalam berkas -> digabung, kolom
--     kosong dilengkapi
--   * email ada di penekanan acara ini -> disimpan dengan tanda berhenti atau
--     memantul (tidak akan dikirimi)
--   * tanpa email -> disimpan; nama yang sama tanpa email -> kemungkinan ganda
create or replace function public.import_event_invitations(
  p_event_id uuid,
  p_rows jsonb,
  p_dry_run boolean,
  p_actor uuid,
  p_test boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_ada public.event_invitations;
  v_tekan text;
  v_email text;
  v_nama text;
  v_baris integer := 0;
  v_baru integer := 0;
  v_gabung integer := 0;
  v_peserta integer := 0;
  v_tanpa_email integer := 0;
  v_tekanan integer := 0;
  v_mirip integer := 0;
  v_contoh_peserta jsonb := '[]'::jsonb;
  v_contoh_mirip jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'IMPORT_TOO_LARGE';
  end if;

  begin
    for r in
      select x.* from jsonb_to_recordset(p_rows) as x(
        "row" integer, name text, email text, company text, title text, phone text, email_hash text)
       order by x."row"
    loop
      v_baris := v_baris + 1;
      v_email := nullif(lower(btrim(r.email)), '');
      v_nama := left(btrim(coalesce(r.name, '')), 120);
      if v_nama = '' then
        raise exception 'IMPORT_NAME_REQUIRED';
      end if;
      if v_email is not null and coalesce(char_length(r.email_hash), 0) < 20 then
        raise exception 'IMPORT_HASH_REQUIRED';
      end if;

      if v_email is null then
        v_tanpa_email := v_tanpa_email + 1;
        if exists (
          select 1 from public.event_invitations
           where event_id = p_event_id and deleted_at is null and email_norm is null
             and lower(btrim(name)) = lower(v_nama)
        ) then
          v_mirip := v_mirip + 1;
          if jsonb_array_length(v_contoh_mirip) < 20 then
            v_contoh_mirip := v_contoh_mirip || jsonb_build_object('row', r."row", 'name', v_nama);
          end if;
        end if;
        insert into public.event_invitations
          (event_id, name, company, title, phone, is_test, attested_by, attested_at, created_by)
        values (p_event_id, v_nama, nullif(left(btrim(r.company), 160), ''), nullif(left(btrim(r.title), 160), ''),
                nullif(left(btrim(r.phone), 30), ''), p_test, p_actor, now(), p_actor);
        continue;
      end if;

      if exists (
        select 1 from public.participants
         where event_id = p_event_id and source_removed_at is null
           and lower(btrim(email)) = v_email
      ) then
        v_peserta := v_peserta + 1;
        if jsonb_array_length(v_contoh_peserta) < 20 then
          v_contoh_peserta := v_contoh_peserta || jsonb_build_object('row', r."row", 'name', v_nama, 'email', v_email);
        end if;
        continue;
      end if;

      select * into v_ada from public.event_invitations
       where event_id = p_event_id and email_norm = v_email and deleted_at is null;
      if v_ada.id is not null then
        v_gabung := v_gabung + 1;
        update public.event_invitations
           set company = coalesce(company, nullif(left(btrim(r.company), 160), '')),
               title = coalesce(title, nullif(left(btrim(r.title), 160), '')),
               phone = coalesce(phone, nullif(left(btrim(r.phone), 30), '')),
               updated_at = now()
         where id = v_ada.id;
        continue;
      end if;

      select reason into v_tekan from public.event_email_suppressions
       where event_id = p_event_id and email_hash = r.email_hash;
      if v_tekan is not null then
        v_tekanan := v_tekanan + 1;
      end if;

      insert into public.event_invitations
        (event_id, name, email, company, title, phone, opted_out_at, email_invalid_at,
         is_test, attested_by, attested_at, created_by)
      values (p_event_id, v_nama, v_email, nullif(left(btrim(r.company), 160), ''), nullif(left(btrim(r.title), 160), ''),
              nullif(left(btrim(r.phone), 30), ''),
              case when v_tekan in ('berhenti', 'spam') then now() end,
              case when v_tekan = 'memantul' then now() end,
              p_test, p_actor, now(), p_actor);
      v_baru := v_baru + 1;
    end loop;

    if p_dry_run then
      raise exception 'IMPORT_DRY_RUN';
    end if;
  exception when raise_exception then
    if sqlerrm <> 'IMPORT_DRY_RUN' then
      raise;
    end if;
  end;

  if not p_dry_run then
    insert into public.audit_logs (event_id, user_id, action, payload)
    values (p_event_id, p_actor, 'invitations_import',
            jsonb_build_object('rows', v_baris, 'inserted', v_baru + v_tanpa_email,
                               'merged', v_gabung, 'participants', v_peserta, 'test', p_test));
  end if;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'rows', v_baris,
    'inserted', v_baru + v_tanpa_email,
    'with_email', v_baru,
    'merged', v_gabung,
    'already_participant', v_peserta,
    'without_email', v_tanpa_email,
    'suppressed', v_tekanan,
    'possible_duplicates', v_mirip,
    'participant_samples', v_contoh_peserta,
    'duplicate_samples', v_contoh_mirip);
end;
$$;

revoke all on function public.import_event_invitations(uuid, jsonb, boolean, uuid, boolean) from public, anon, authenticated;
grant execute on function public.import_event_invitations(uuid, jsonb, boolean, uuid, boolean) to service_role;

-- Penghapusan data (UU PDP 27/2022) ------------------------------------------------

-- Tamu yang tidak menjadi peserta (tidak pernah mendaftar, pendaftarannya
-- dihapus, atau ditolak) dihapus 30 hari setelah acara. Acara tanpa tanggal
-- memakai tanggal arsip, atau setahun setelah dibuat. Nama, alamat, dan
-- alasan (bisa memuat alamat dari pesan galat penyedia) di baris kiriman yang
-- menunjuk ke mereka ikut dikosongkan. Penekanan (hash) tetap.
create or replace function public.purge_event_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jumlah integer;
begin
  update public.message_blast_recipients r
     set address = null, name = '', reason = null
    from public.event_invitations i
    join public.events e on e.id = i.event_id
   where r.invitation_id = i.id
     and i.participant_id is null
     and (i.registration_id is null or i.rejected_at is not null)
     and coalesce(e.end_date, e.event_date, e.archived_at::date, e.created_at::date + 365) < current_date - 30;

  delete from public.event_invitations i
   using public.events e
   where e.id = i.event_id
     and i.participant_id is null
     and (i.registration_id is null or i.rejected_at is not null)
     and coalesce(e.end_date, e.event_date, e.archived_at::date, e.created_at::date + 365) < current_date - 30;
  get diagnostics v_jumlah = row_count;
  return v_jumlah;
end;
$$;

revoke all on function public.purge_event_invitations() from public, anon, authenticated;

-- Jejak batas laju lebih dari 2 hari tidak dipakai lagi.
create or replace function public.purge_invitation_rate_events()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.invitation_rate_events where created_at < now() - interval '2 days';
$$;

revoke all on function public.purge_invitation_rate_events() from public, anon, authenticated;

-- Salinan acara -------------------------------------------------------------------

-- Salinan acara "Hanya tamu undangan" tidak boleh terbuka untuk siapa saja.
-- Disisipkan ke `duplicate_event` lewat penggantian teks, pola yang sama dengan
-- 202608200002 dan 202609300005. Tamu undangannya sendiri tidak disalin.
do $$
declare
  sumber_def text;
  jangkar text := 'returning * into baru;';
begin
  select pg_get_functiondef(p.oid) into sumber_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'duplicate_event'
  limit 1;

  if sumber_def is null then
    raise notice 'duplicate_event tidak ditemukan; lewati penyalinan setelan undangan.';
    return;
  end if;

  if position('registration_access' in sumber_def) > 0 then
    return;
  end if;

  if position(jangkar in sumber_def) = 0
     or position(jangkar in substr(sumber_def, position(jangkar in sumber_def) + 1)) > 0 then
    raise exception 'duplicate_event berubah bentuk: titik sisip setelan undangan tidak ditemukan atau ganda';
  end if;

  sumber_def := replace(sumber_def, jangkar,
    jangkar || E'\n\n  update public.events'
    || E'\n     set registration_access = sumber.registration_access,'
    || E'\n         invitation_auto_approve = sumber.invitation_auto_approve'
    || E'\n   where id = baru.id'
    || E'\n  returning * into baru;');
  execute sumber_def;
end $$;

commit;

-- Di luar transaksi: job harian pukul 03.15 UTC (10.15 WIB). Aman dijalankan
-- ulang; cron.schedule dengan nama yang sama menimpa jadwal lama.
-- Dua job terpisah: galat yang satu tidak menahan yang lain.
select cron.schedule('tally-undangan-bersih', '15 3 * * *', $job$select public.purge_event_invitations();$job$);
select cron.schedule('tally-undangan-jejak', '20 3 * * *', $job$select public.purge_invitation_rate_events();$job$);
