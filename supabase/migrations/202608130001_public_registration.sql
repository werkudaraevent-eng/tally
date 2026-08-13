-- ============================================================================
-- Form registrasi publik (P3).
--
-- BENTUKNYA: tabel ANTREAN tersendiri, bukan insert langsung ke participants.
-- Alasannya bukan selera:
--
--   1. `participants` ditimpa berkala oleh `upsert_external_participants`
--      (cron 5 menit) untuk event bersumber scanner_api/hybrid. Kolom apa pun
--      yang hanya diisi form akan hilang pada sinkronisasi berikutnya. Ini
--      pelajaran yang sama dengan undian_exclusions dan leaderboard_exclusions:
--      keduanya dipisah dari participants persis karena sebab ini.
--   2. Pendaftaran yang ditolak tetap harus punya jejak. Kalau form menulis
--      langsung ke participants, menolak berarti MENGHAPUS, dan panitia tidak
--      punya cara menjawab "kemarin saya sudah daftar, kok tidak ada?".
--   3. Endpoint-nya publik tanpa login. Menulis langsung ke participants berarti
--      siapa pun yang tahu URL-nya bisa menambah baris ke tabel yang dipakai
--      leaderboard, undian, dan scan booth.
--
-- Auto-approve tetap didukung lewat toggle per event; bedanya baris antrean
-- tetap ditulis, hanya langsung berstatus 'approved'. Jadi mematikan toggle di
-- tengah acara tidak meninggalkan dua bentuk data yang berbeda.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kolom kontak di participants
--
-- NULLABLE, bukan NOT NULL. Komentar di 202608070001 menyebut "wajib di skema
-- tabel pendaftaran" -- dan memang di sanalah ia ditegakkan (lihat bagian 2).
-- Di participants ia harus boleh kosong: 278 baris yang sudah ada berasal dari
-- Scanner API, yang tidak mengirim email maupun telepon. NOT NULL di sini
-- membuat migrasi ini gagal, dan mengisinya dengan '' hanya memindahkan
-- masalahnya ke tempat yang lebih sulit dilihat.
-- ---------------------------------------------------------------------------
alter table public.participants add column if not exists email text;
alter table public.participants add column if not exists phone text;

comment on column public.participants.email is
  'Hanya terisi untuk peserta dari form registrasi publik. Scanner API tidak mengirimnya.';
comment on column public.participants.phone is
  'Hanya terisi untuk peserta dari form registrasi publik. Scanner API tidak mengirimnya.';

-- ---------------------------------------------------------------------------
-- 2. Antrean pendaftaran
-- ---------------------------------------------------------------------------
create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),

  -- on delete restrict, sama dengan participants dan seluruh tabel anak event.
  -- Menghapus event yang punya pendaftar harus disengaja, bukan efek samping.
  event_id uuid not null references public.events(id) on delete restrict,

  -- Ketiganya NOT NULL. Email khususnya: QR dikirim ke sana, dan pendaftar
  -- tanpa email tidak punya jalan menerima apa pun.
  name text not null,
  email text not null,
  phone text not null,

  company text,
  job_title text,

  -- Field tambahan dari events.registration_form_config. Disimpan apa adanya:
  -- kolomnya ditentukan admin per event, jadi tidak bisa jadi kolom tabel.
  extra jsonb not null default '{}'::jsonb,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),

  -- Terisi saat disetujui. on delete set null: menghapus peserta (mis. lewat
  -- admin_reset_records) tidak boleh menghapus riwayat pendaftarannya.
  participant_id uuid references public.participants(id) on delete set null,

  reject_reason text,

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,

  -- Jejak asal. Dipakai saat ada lonjakan pendaftaran mencurigakan; bukan untuk
  -- ditampilkan ke siapa pun.
  submitted_ip text,

  constraint registrations_email_format check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Status dan bukti kerjanya harus konsisten dua arah, kalau tidak daftar yang
  -- memfilter status <> 'pending' akan berbeda hasil dari yang memfilter
  -- reviewed_at is not null.
  constraint registrations_reviewed_consistent check (
    (status = 'pending') = (reviewed_at is null)
  )
  -- CHECK "approved wajib punya participant_id" SENGAJA TIDAK ada. Kolomnya
  -- `on delete set null`, jadi `admin_reset_records` yang menghapus peserta akan
  -- mengosongkannya sementara status tetap 'approved' -- dan CHECK itu akan
  -- membatalkan seluruh reset. Baris approved dengan participant_id null punya
  -- arti yang benar: "pernah disetujui, pesertanya sudah dihapus".
);

comment on table public.event_registrations is
  'Antrean pendaftaran publik. Terpisah dari participants karena participants ditimpa berkala oleh sinkronisasi Scanner API, dan karena pendaftaran yang ditolak tetap harus punya jejak.';

-- Satu email satu pendaftaran per event -- tetapi HANYA untuk yang belum
-- ditolak. Orang yang ditolak karena salah ketik nama perusahaan harus bisa
-- mendaftar ulang; indeks penuh akan mengunci dia selamanya.
create unique index event_registrations_email_unique
  on public.event_registrations (event_id, lower(email))
  where status <> 'rejected';

create index event_registrations_event_status_idx
  on public.event_registrations (event_id, status, created_at desc);

alter table public.event_registrations enable row level security;
revoke all on table public.event_registrations from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Toggle auto-approve per event
--
-- Default false. Event yang baru menyalakan pendaftaran mendapat moderasi
-- lebih dulu; melewatkannya harus tindakan sadar, bukan bawaan.
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists registration_auto_approve boolean not null default false;

comment on column public.events.registration_auto_approve is
  'true = pendaftar langsung jadi peserta dan QR terbit seketika. false = masuk antrean, panitia menyetujui satu per satu.';

-- ---------------------------------------------------------------------------
-- 4. Kode QR untuk peserta hasil pendaftaran
--
-- TIDAK memakai id pendaftaran atau email: kode ini dicetak jadi QR dan dibaca
-- pemindai booth, jadi ia harus pendek dan tidak membocorkan apa pun.
-- Keunikan qr_code kini per event (participants_qr_code_event_unique), jadi
-- pencarian kode bebas juga harus per event.
-- ---------------------------------------------------------------------------
create function public.generate_registration_qr(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  kandidat text;
  percobaan int := 0;
begin
  loop
    kandidat := 'REG' || lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (
      select 1 from public.participants
      where event_id = p_event_id and qr_code = kandidat
    );
    percobaan := percobaan + 1;
    -- 1 juta kemungkinan; 50 tabrakan berturut-turut berarti ada yang salah
    -- secara mendasar (mis. event dengan ratusan ribu peserta). Melempar lebih
    -- baik daripada berputar selamanya di dalam transaksi yang memegang lock.
    if percobaan > 50 then
      raise exception 'REGISTRATION_QR_EXHAUSTED';
    end if;
  end loop;
  return kandidat;
end $$;

revoke all on function public.generate_registration_qr(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Kirim pendaftaran
--
-- Satu RPC, bukan "insert lalu approve" dari route handler: pada event
-- auto-approve keduanya harus terjadi bersama. Dipisah, kegagalan di langkah
-- kedua meninggalkan pendaftar berstatus pending di event yang tidak punya
-- siapa pun yang memoderasi -- dan tidak ada yang tahu sampai ia mengeluh.
-- ---------------------------------------------------------------------------
create function public.submit_event_registration(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_company text default null,
  p_job_title text default null,
  p_extra jsonb default '{}'::jsonb,
  p_ip text default null
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
    (p_event_id, btrim(p_name), lower(btrim(p_email)), btrim(p_phone),
     nullif(btrim(coalesce(p_company, '')), ''), nullif(btrim(coalesce(p_job_title, '')), ''),
     coalesce(p_extra, '{}'::jsonb), p_ip)
  returning id into reg_id;

  if not ev.registration_auto_approve then
    insert into public.audit_logs (event_id, action, payload)
    values (p_event_id, 'registration_submitted',
            jsonb_build_object('registration_id', reg_id, 'auto_approved', false));
    return jsonb_build_object('registration_id', reg_id, 'status', 'pending', 'qr_code', null);
  end if;

  kode := public.generate_registration_qr(p_event_id);
  insert into public.participants (event_id, qr_code, name, company, title, email, phone)
  values (p_event_id, kode, btrim(p_name),
          nullif(btrim(coalesce(p_company, '')), ''),
          nullif(btrim(coalesce(p_job_title, '')), ''),
          lower(btrim(p_email)), btrim(p_phone))
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

revoke all on function public.submit_event_registration(uuid, text, text, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.submit_event_registration(uuid, text, text, text, text, text, jsonb, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Moderasi
--
-- `p_event_id` ikut dikirim dan DIPERIKSA, tidak sekadar diambil dari barisnya.
-- Tanpa itu admin event A yang mengirim id pendaftaran event B akan menyetujui
-- peserta ke event yang salah, dan tidak ada satu pun galat yang muncul.
-- ---------------------------------------------------------------------------
create function public.review_event_registration(
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
  insert into public.participants (event_id, qr_code, name, company, title, email, phone)
  values (p_event_id, kode, reg.name, reg.company, reg.job_title, reg.email, reg.phone)
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
