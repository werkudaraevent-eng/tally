-- ============================================================================
-- Perancang form registrasi publik.
--
-- Mesin field tambahannya SUDAH ADA sejak 202608130001: admin menyimpan daftar
-- field di `events.registration_form_config`, form publik merendernya, dan
-- jawabannya masuk ke `event_registrations.extra`. Yang belum ada hanya dua:
--
--   1. Jawaban itu berhenti di tabel antrean. Kedua jalur persetujuan hanya
--      menyalin nama, perusahaan, jabatan, email, dan telepon ke `participants`,
--      jadi jawaban field tambahan tidak pernah bisa dipakai untuk apa pun
--      setelah pendaftarnya disetujui.
--   2. Tidak ada tempat menyimpan berkas yang diunggah pendaftar.
--
-- Migrasi ini menutup keduanya.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Jawaban field tambahan ikut ke peserta
--
-- AMAN terhadap cron sinkronisasi, dan itu bukan kebetulan. Komentar di
-- 202608130001 memperingatkan bahwa kolom yang hanya diisi form akan hilang saat
-- `upsert_external_participants` berjalan — peringatan itu berlaku untuk kolom
-- yang IKUT ditimpa. RPC tersebut menyebut kolomnya satu per satu di
-- `on conflict do update set`, bukan `excluded.*`, jadi kolom baru yang tidak
-- disebut di sana tidak pernah tersentuh.
--
-- Konsekuensinya harus diingat saat mengubah RPC itu nanti: menambahkan `extra`
-- ke daftar `do update set` akan menghapus jawaban pendaftar setiap lima menit.
-- ---------------------------------------------------------------------------
alter table public.participants
  add column if not exists extra jsonb not null default '{}'::jsonb;

comment on column public.participants.extra is
  'Jawaban field tambahan form registrasi publik, disalin saat pendaftaran disetujui. Peserta dari Scanner API dan impor manual tidak punya isi di sini. JANGAN tambahkan kolom ini ke daftar on-conflict-update pada upsert_external_participants: cron akan menghapusnya tiap lima menit.';

-- ---------------------------------------------------------------------------
-- 2. Berkas unggahan pendaftar
--
-- Tabel tersendiri, bukan sekadar URL di dalam `extra`. Tiga alasan:
--
--   1. Bucket-nya PRIVAT. Yang disimpan adalah path di storage, bukan URL yang
--      bisa dibuka siapa saja. URL untuk admin dibuat sesaat lewat signed URL.
--      Berkas identitas yang tersimpan sebagai URL publik permanen adalah
--      kebocoran data pribadi, bukan sekadar kelemahan teknis.
--   2. Unggahan terjadi SEBELUM formulir dikirim. Berkas yang diunggah lalu
--      formulirnya ditinggalkan menjadi yatim, dan tanpa baris tersendiri tidak
--      ada cara menemukannya untuk dibersihkan.
--   3. Menghapus pendaftaran harus ikut menghapus berkasnya. Sebagai baris
--      dengan foreign key, itu terjadi sendiri lewat `on delete cascade`.
-- ---------------------------------------------------------------------------
create table if not exists public.registration_uploads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,

  -- Terisi saat formulirnya benar-benar terkirim. NULL = masih yatim, dan
  -- pembersih berkala boleh menghapusnya setelah beberapa jam.
  registration_id uuid references public.event_registrations(id) on delete cascade,

  -- Kunci field di registration_form_config. Dipakai admin untuk tahu berkas ini
  -- jawaban pertanyaan yang mana.
  field_key text not null,

  -- Path di bucket privat, BUKAN URL.
  storage_path text not null unique,

  -- Nama asli hanya untuk ditampilkan ke admin. TIDAK dipakai sebagai nama
  -- berkas di storage: nama dari pengguna bisa memuat path traversal, dan nama
  -- yang bertabrakan akan saling menimpa.
  original_name text not null,
  mime_type text not null,
  size_bytes int not null check (size_bytes > 0),

  submitted_ip text,
  created_at timestamptz not null default now()
);

create index registration_uploads_registration_idx
  on public.registration_uploads (registration_id);

-- Berkas yatim: diunggah, formulirnya tidak pernah dikirim.
create index registration_uploads_orphan_idx
  on public.registration_uploads (created_at)
  where registration_id is null;

comment on table public.registration_uploads is
  'Berkas yang diunggah pendaftar publik. Bucket privat; kolom storage_path bukan URL. Baris tanpa registration_id adalah unggahan yatim yang boleh dibersihkan.';

alter table public.registration_uploads enable row level security;

-- Tanpa policy sama sekali: seluruh akses lewat service_role di route handler,
-- pola yang sama dengan tabel operasional lain di skema ini.
revoke all on table public.registration_uploads from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2b. Bucket privat
--
-- `public = false`, dan itu perbedaan pokok dari bucket `display-assets`.
-- Berkas di sana adalah logo dan latar layar yang memang untuk dilihat siapa
-- saja. Di sini isinya berkas milik pendaftar — bisa berupa kartu identitas,
-- foto, atau surat tugas. URL permanen yang bisa dibuka siapa pun yang
-- menebaknya adalah kebocoran data pribadi.
--
-- Admin melihatnya lewat signed URL berumur pendek yang dibuat di server.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('registration-uploads', 'registration-uploads', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Pencatatan unggahan
--
-- Dipanggil endpoint publik. Yang membatasinya bukan fungsi ini melainkan route
-- handler (tipe berkas, ukuran, dan pembatasan laju per IP) — sama seperti
-- submit_event_registration. Yang ditegakkan di sini hanya hal yang tidak boleh
-- bergantung pada klien: event harus ada dan pendaftarannya harus terbuka.
-- ---------------------------------------------------------------------------
create or replace function public.record_registration_upload(
  p_event_id uuid,
  p_field_key text,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes int,
  p_ip text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events;
  upload_id uuid;
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

  insert into public.registration_uploads
    (event_id, field_key, storage_path, original_name, mime_type, size_bytes, submitted_ip)
  values
    (p_event_id, btrim(p_field_key), p_storage_path, btrim(p_original_name),
     p_mime_type, p_size_bytes, p_ip)
  returning id into upload_id;

  return upload_id;
end $$;

revoke all on function public.record_registration_upload(uuid, text, text, text, text, int, text)
  from public, anon, authenticated;
grant execute on function public.record_registration_upload(uuid, text, text, text, text, int, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3b. Email dan telepon menjadi opsional
--
-- Sebelumnya keduanya NOT NULL, dan komentar di 202608130001 menyebut alasannya:
-- kode peserta dikirim lewat email, jadi pendaftar tanpa email tidak punya jalan
-- menerimanya. Alasan itu masih berlaku — yang berubah adalah siapa yang
-- memutuskannya. Sekarang admin per event, lewat `require_email` dan
-- `require_phone` di registration_form_config.
--
-- Dua akibat yang menempel pada keputusan itu, dan keduanya tidak bisa
-- dihilangkan oleh kode:
--
--   1. Tanpa email, kode peserta HANYA muncul di layar sekali. Pendaftar yang
--      menutup halaman kehilangannya, dan panitia harus mencarinya di CMS.
--   2. `event_registrations_email_unique` adalah indeks parsial atas
--      lower(email). Postgres membolehkan banyak baris NULL pada indeks unik,
--      jadi begitu email dikosongkan, pencegahan pendaftaran ganda hilang. Yang
--      tersisa hanya pembatasan laju per IP di route handler.
-- ---------------------------------------------------------------------------
alter table public.event_registrations alter column email drop not null;
alter table public.event_registrations alter column phone drop not null;

-- CHECK format email ditulis ulang supaya menerima NULL. Versi lama menolak
-- baris tanpa email sebelum kolomnya sempat dianggap opsional.
alter table public.event_registrations drop constraint if exists registrations_email_format;
alter table public.event_registrations add constraint registrations_email_format
  check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

comment on column public.event_registrations.email is
  'Boleh kosong bila admin mematikan require_email. Konsekuensinya kode peserta tidak dapat dikirim dan pendaftaran ganda tidak lagi tertahan indeks unik.';

-- ---------------------------------------------------------------------------
-- 4. Kirim formulir: jawaban tambahan ikut ke peserta saat auto-approve,
--    dan berkas yatim dikaitkan ke pendaftarannya.
--
-- Ditulis ulang utuh, bukan ditambal: fungsi ini adalah satu-satunya jalan
-- masuk dari endpoint publik, dan versi yang berbeda-beda antar migrasi membuat
-- pembacaan ulangnya di kemudian hari harus menyusun potongan dari beberapa
-- berkas.
-- ---------------------------------------------------------------------------
create or replace function public.submit_event_registration(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_company text default null,
  p_job_title text default null,
  p_extra jsonb default '{}'::jsonb,
  p_ip text default null,
  p_upload_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events;
  reg_id uuid;
  peserta_id uuid;
  kode text;
begin
  select * into ev from public.events where id = p_event_id;
  if ev.id is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  -- Ketiga syarat DIPERIKSA DI SINI, bukan hanya di route handler. Endpoint ini
  -- publik; satu-satunya penjaga yang tidak bisa dilewati adalah database.
  if not ev.registration_enabled then
    raise exception 'REGISTRATION_CLOSED';
  end if;
  if ev.status not in ('draft', 'active') then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  insert into public.event_registrations
    (event_id, name, email, phone, company, job_title, extra, submitted_ip)
  values
    (p_event_id, btrim(p_name),
     -- nullif, bukan lower(btrim(...)) langsung: form mengirim string kosong
     -- untuk kolom yang dimatikan admin, dan '' akan lolos CHECK format hanya
     -- karena CHECK-nya sekarang mengizinkan NULL — bukan string kosong.
     nullif(lower(btrim(coalesce(p_email, ''))), ''),
     nullif(btrim(coalesce(p_phone, '')), ''),
     nullif(btrim(coalesce(p_company, '')), ''), nullif(btrim(coalesce(p_job_title, '')), ''),
     coalesce(p_extra, '{}'::jsonb), p_ip)
  returning id into reg_id;

  -- Berkas dikaitkan HANYA bila event-nya cocok. Tanpa syarat itu, id unggahan
  -- milik event lain yang ditebak dari luar akan menempel ke pendaftaran ini.
  if array_length(p_upload_ids, 1) is not null then
    update public.registration_uploads
       set registration_id = reg_id
     where id = any (p_upload_ids)
       and event_id = p_event_id
       and registration_id is null;
  end if;

  if not ev.registration_auto_approve then
    insert into public.audit_logs (event_id, action, payload)
    values (p_event_id, 'registration_submitted',
            jsonb_build_object('registration_id', reg_id, 'auto_approved', false));
    return jsonb_build_object('registration_id', reg_id, 'status', 'pending', 'qr_code', null);
  end if;

  kode := public.generate_registration_qr(p_event_id);
  insert into public.participants (event_id, qr_code, name, company, title, email, phone, extra)
  values (p_event_id, kode, btrim(p_name),
          nullif(btrim(coalesce(p_company, '')), ''),
          nullif(btrim(coalesce(p_job_title, '')), ''),
          nullif(lower(btrim(coalesce(p_email, ''))), ''),
          nullif(btrim(coalesce(p_phone, '')), ''),
          coalesce(p_extra, '{}'::jsonb))
  returning id into peserta_id;

  update public.event_registrations
     set status = 'approved', participant_id = peserta_id, reviewed_at = now()
   where id = reg_id;

  insert into public.audit_logs (event_id, action, payload)
  values (p_event_id, 'registration_submitted',
          jsonb_build_object('registration_id', reg_id, 'auto_approved', true,
                             'participant_id', peserta_id, 'qr_code', kode));

  return jsonb_build_object('registration_id', reg_id, 'status', 'approved', 'qr_code', kode);
end $$;

revoke all on function public.submit_event_registration(uuid, text, text, text, text, text, jsonb, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.submit_event_registration(uuid, text, text, text, text, text, jsonb, text, uuid[])
  to service_role;

-- Versi lama (tanpa p_upload_ids) dibuang supaya tidak ada dua fungsi bernama
-- sama dengan perilaku berbeda. Dijatuhkan SETELAH yang baru dibuat: urutan
-- sebaliknya meninggalkan jendela waktu tanpa fungsi sama sekali.
drop function if exists public.submit_event_registration(uuid, text, text, text, text, text, jsonb, text);

-- ---------------------------------------------------------------------------
-- 5. Moderasi: jawaban tambahan ikut ke peserta saat disetujui manual.
-- ---------------------------------------------------------------------------
create or replace function public.review_event_registration(
  p_event_id uuid,
  p_registration_id uuid,
  p_actor uuid,
  p_approve boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reg public.event_registrations;
  peserta_id uuid;
  kode text;
begin
  select * into reg from public.event_registrations
  where id = p_registration_id and event_id = p_event_id for update;
  if reg.id is null then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;
  -- Bukan idempoten dengan sengaja: dua admin yang membuka daftar yang sama
  -- lalu sama-sama menekan Setujui akan membuat DUA peserta dengan dua QR bila
  -- pemeriksaan ini tidak ada, dan yang kedua tidak pernah dipakai siapa pun.
  if reg.status <> 'pending' then
    raise exception 'REGISTRATION_ALREADY_REVIEWED';
  end if;

  if not p_approve then
    update public.event_registrations
       set status = 'rejected', reviewed_at = now(), reviewed_by = p_actor,
           reject_reason = nullif(btrim(coalesce(p_reason, '')), '')
     where id = reg.id;
    insert into public.audit_logs (event_id, user_id, action, payload)
    values (p_event_id, p_actor, 'registration_rejected',
            jsonb_build_object('registration_id', reg.id, 'email', reg.email, 'reason', p_reason));
    return jsonb_build_object('status', 'rejected', 'qr_code', null, 'participant_id', null);
  end if;

  kode := public.generate_registration_qr(p_event_id);
  insert into public.participants (event_id, qr_code, name, company, title, email, phone, extra)
  values (p_event_id, kode, reg.name, reg.company, reg.job_title, reg.email, reg.phone,
          coalesce(reg.extra, '{}'::jsonb))
  returning id into peserta_id;

  update public.event_registrations
     set status = 'approved', participant_id = peserta_id,
         reviewed_at = now(), reviewed_by = p_actor
   where id = reg.id;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'registration_approved',
          jsonb_build_object('registration_id', reg.id, 'email', reg.email,
                             'participant_id', peserta_id, 'qr_code', kode));

  return jsonb_build_object('status', 'approved', 'qr_code', kode, 'participant_id', peserta_id);
end $$;

revoke all on function public.review_event_registration(uuid, uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.review_event_registration(uuid, uuid, uuid, boolean, text)
  to service_role;
