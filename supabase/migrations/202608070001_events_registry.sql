-- ============================================================================
-- Multi-event TAHAP 1: registry event + hak akses user
--
-- Tahap ini SENGAJA tidak menyentuh tabel transaksi (orders, participants,
-- booths, settings). Setelah migrasi ini dijalankan, aplikasi lama tetap
-- berjalan 100% seperti sebelumnya: belum ada satu pun kolom yang dibaca
-- ulang, dan belum ada RPC yang berubah.
--
-- Alasan dipecah: percobaan pertama menggabungkan registry + event_id + ganti
-- primary key dalam satu berkas. Terbukti gagal di dua titik sekaligus
-- (2BP01 saat drop primary key yang punya anak FK, dan 23514 karena
-- CHECK (id = 1) tidak ikut dibuang). Satu migrasi raksasa membuat kegagalan
-- di tengah meninggalkan skema setengah jadi yang sulit dikembalikan.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabel events
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  event_date date,

  status text not null default 'draft'
    check (status in ('draft', 'active', 'completed', 'archived')),

  -- Sumber data peserta. Ditaruh per event, bukan env var, karena satu deploy
  -- kini melayani banyak event yang cara pengumpulan datanya bisa berbeda.
  participant_source text not null default 'manual'
    check (participant_source in ('scanner_api', 'manual', 'public_form', 'hybrid')),
  scanner_api_event_slug text,

  registration_enabled boolean not null default false,
  registration_form_config jsonb not null default '{}'::jsonb,

  -- Zona waktu pindah ke sini dari event_settings: ia identitas event.
  --
  -- Nilainya ID IANA, PERSIS sama dengan CHECK event_settings_time_zone_allowed.
  -- Bukan singkatan 'WIB'/'WITA'/'WIT' -- itu hanya label tampilan di
  -- src/lib/timezone.ts (timeZoneAbbr). Memakai singkatan di sini membuat nilai
  -- yang disalin dari event_settings ('Asia/Makassar') langsung ditolak CHECK.
  --
  -- Daftar tertutup dipertahankan karena seluruh src/lib/timezone.ts bertumpu
  -- pada asumsi "tidak ada zona Indonesia yang punya DST".
  time_zone text not null default 'Asia/Jakarta'
    check (time_zone in ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- created_by boleh NULL: event pertama dibuat oleh migrasi, bukan oleh orang.
  -- on delete set null, karena menghapus user tidak boleh menghapus event.
  created_by uuid references public.users(id) on delete set null,

  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,

  -- Slug masuk URL publik (/e/<slug>/display). Dibatasi agar tidak pernah
  -- perlu di-encode dan tidak bisa menyerupai path lain.
  constraint events_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),

  -- scanner_api_event_slug WAJIB ada kalau sumbernya memang API. Tanpa CHECK
  -- ini, event bersumber API tanpa slug akan tersinkron NOL peserta tanpa
  -- galat apa pun -- panitia baru sadar saat peserta pertama gagal discan.
  constraint events_scanner_slug_required check (
    participant_source not in ('scanner_api', 'hybrid')
    or (scanner_api_event_slug is not null and length(btrim(scanner_api_event_slug)) > 0)
  ),

  -- Form registrasi hanya boleh aktif kalau sumbernya memang menerimanya.
  constraint events_registration_source check (
    registration_enabled = false
    or participant_source in ('public_form', 'hybrid')
  ),

  -- Status archived dan archived_at harus konsisten dua arah. Kalau tidak,
  -- daftar event yang memfilter archived_at is null akan berbeda hasil dari
  -- yang memfilter status <> 'archived'.
  constraint events_archived_consistent check (
    (status = 'archived') = (archived_at is not null)
  )
);

comment on table public.events is
  'Registry event. Satu deploy melayani banyak event sekaligus; setiap event punya data terisolasi. Slug dipakai di URL publik /e/<slug>/...';
comment on column public.events.participant_source is
  'scanner_api = tarik dari API eksternal, manual = entri/impor di CMS, public_form = peserta mendaftar sendiri, hybrid = gabungan.';
comment on column public.events.scanner_api_event_slug is
  'Slug event di Scanner API. Menggantikan env var SCANNER_API_EVENT_SLUG yang hanya bisa menunjuk satu event.';
comment on column public.events.registration_form_config is
  'Konfigurasi field tambahan form registrasi publik. Field wajib (nama, email, telepon) TIDAK disimpan di sini -- ia ditegakkan di skema tabel pendaftaran, bukan di konfigurasi yang bisa dikosongkan admin.';

-- Hanya event yang masih berjalan yang sering di-query.
create index events_status_idx on public.events (status) where status in ('active', 'draft');
create index events_active_idx on public.events (id) where status = 'active';

-- ---------------------------------------------------------------------------
-- 2. Hak akses user per event
--
-- Keputusan A: users.event_id TIDAK dipakai. Satu kolom hanya bisa menyimpan
-- satu event, sehingga admin yang menangani dua event harus punya dua akun --
-- dua PIN untuk satu orang, dan jejak audit yang terpecah.
--
-- super_admin TANPA baris di tabel ini = akses semua event. Ditegakkan di
-- guard aplikasi, bukan dengan menuliskan satu baris per event, karena kalau
-- pemilik sistem harus didaftarkan manual maka event yang baru dibuat akan
-- tidak bisa diakses oleh pembuatnya sendiri.
-- ---------------------------------------------------------------------------

create table public.user_event_access (
  user_id uuid not null references public.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,

  -- Peran DI EVENT INI. Sengaja tidak memakai users.role secara langsung:
  -- satu orang bisa jadi admin di event A dan kasir di event B.
  role public.user_role not null,

  -- booth_id diverifikasi se-event lewat FK komposit di TAHAP 2, setelah
  -- booths punya kolom event_id. Sebelum itu FK komposit belum mungkin dibuat.
  booth_id integer references public.booths(id) on delete set null,

  granted_at timestamptz not null default now(),
  granted_by uuid references public.users(id) on delete set null,

  primary key (user_id, event_id)
);

comment on table public.user_event_access is
  'Hak akses user per event. super_admin tanpa baris di sini berarti akses ke SEMUA event. Peran disimpan per event karena satu orang bisa admin di satu event dan kasir di event lain.';
comment on column public.user_event_access.booth_id is
  'Booth yang dipegang user ini di event tersebut. Wajib untuk peran booth (ditegakkan CHECK di TAHAP 2 setelah booths.event_id ada).';

create index user_event_access_event_idx on public.user_event_access (event_id);
create index user_event_access_user_idx on public.user_event_access (user_id);

-- ---------------------------------------------------------------------------
-- 3. Seed event pertama dari data yang sudah ada
--
-- Data acara yang sudah berjalan menjadi event pertama. Nilainya dibaca dari
-- event_settings agar nama dan zona waktu tidak ditulis ulang secara hardcode
-- lalu berbeda dari yang selama ini tampil di layar.
-- ---------------------------------------------------------------------------

do $$
declare
  v_event_id uuid;
  v_name text;
  v_tz text;
  v_akses int;
begin
  -- Nama acara TIDAK ada di event_settings (kolomnya: pickup_mode,
  -- name_display_mode, leaderboard_enabled, pending_auto_void_minutes,
  -- cashier_confirmation_required, time_zone). Ia tersimpan sebagai
  -- display_settings.event_title / rundown_settings.event_title.
  --
  -- rundown_settings didahulukan karena isinya judul acara yang dipakai di
  -- halaman rundown ("PRIMA EXECUTIVE GATHERING 2026"); display_settings jadi
  -- cadangan. Keduanya dicoba sebelum menyerah ke nilai tetap, supaya nama di
  -- kartu event sama dengan yang selama ini tampil di layar.
  select nullif(btrim(r.event_title), '')
  into v_name
  from public.rundown_settings r
  where r.id = 1;

  if v_name is null then
    select nullif(btrim(d.event_title), '')
    into v_name
    from public.display_settings d
    where d.id = 1;
  end if;

  v_name := coalesce(v_name, 'PRIMA Executive Gathering 2026');

  select time_zone into v_tz from public.event_settings where id = 1;
  v_tz := coalesce(v_tz, 'Asia/Jakarta');

  insert into public.events (
    slug, name, event_date, status,
    participant_source, scanner_api_event_slug, time_zone
  ) values (
    'prima-executive-gathering-2026',
    v_name,
    -- Tanggal diambil dari order paling awal; itu bukti kapan acara benar-benar
    -- berjalan. Menebak tanggal akan tampil di kartu event sebagai fakta.
    (select min(created_at)::date from public.orders),
    'active',
    'scanner_api',
    -- Nilai env var SCANNER_API_EVENT_SLUG yang dipakai selama ini.
    'prima-executive-gathering-2026',
    v_tz
  )
  returning id into v_event_id;

  -- Semua user yang ada diberi akses ke event pertama dengan peran & booth
  -- yang sekarang. super_admin dilewati: ia sudah punya akses ke semua event,
  -- dan mendaftarkannya di sini membuat aturan "tanpa baris = semua" bohong.
  insert into public.user_event_access (user_id, event_id, role, booth_id)
  select u.id, v_event_id, u.role, u.booth_id
  from public.users u
  where u.role <> 'super_admin';

  select count(*) into v_akses from public.user_event_access where event_id = v_event_id;

  raise notice 'Event pertama: % (%). Hak akses user dibuat: %', v_name, v_event_id, v_akses;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Pembatas jumlah event aktif
--
-- Keputusan C: URL publik lama (/display, /denah, /rundown, /undian) tetap
-- hidup selama hanya ada SATU event aktif. Fungsi ini yang dipakai handler
-- publik untuk memutuskan: satu hasil = layani seperti biasa, lebih dari satu
-- = tampilkan pemilih event.
--
-- Tidak memakai "ambil yang terbaru" sebagai fallback. Repo ini sudah pernah
-- kena bug dari pola itu (draw_round pada baris singleton): nilai yang salah
-- tidak menimbulkan galat, ia hanya menampilkan data event yang salah di
-- proyektor. Ambigu harus jadi pertanyaan, bukan tebakan.
-- ---------------------------------------------------------------------------

create or replace function public.active_event_ids()
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  select id from public.events where status = 'active' order by created_at;
$$;

comment on function public.active_event_ids is
  'Daftar id event berstatus active. Handler publik tanpa slug memakai ini: tepat satu = layani, lebih dari satu = minta pengguna memilih. Sengaja TIDAK mengembalikan satu baris "terbaru" -- menebak event berarti menayangkan data event yang salah tanpa galat.';

-- ---------------------------------------------------------------------------
-- 5. Hak akses (pola repo: RLS nyala, nol policy, revoke dari anon)
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.user_event_access enable row level security;

revoke all on table public.events from anon, authenticated;
revoke all on table public.user_event_access from anon, authenticated;
revoke all on function public.active_event_ids() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verifikasi manual setelah dijalankan:
--   select slug, name, status, event_date, time_zone from public.events;
--   select count(*) from public.user_event_access;   -- harus 15 (16 user - 1 super_admin)
--   select * from public.active_event_ids();          -- harus tepat 1 baris
-- ---------------------------------------------------------------------------
