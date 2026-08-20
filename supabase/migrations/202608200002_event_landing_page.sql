-- ============================================================================
-- Landing page publik per acara.
--
-- Pemisahan yang menentukan bentuk migrasi ini: FAKTA ACARA versus KONTEN
-- HALAMAN.
--
--   * Jam, venue, dan tagline adalah fakta. Email konfirmasi, rundown, berkas
--     kalender, dan layar sukses pendaftaran semuanya membacanya. Kalau ditanam
--     di dalam konfigurasi halaman, mengganti venue berarti menyunting halaman
--     pemasaran — dan sistem lain tidak punya cara membacanya.
--   * Banner, urutan bagian, dan teks tombol adalah konten halaman. Hanya
--     landing page yang peduli.
--
-- Yang pertama menjadi kolom. Yang kedua menjadi satu jsonb.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fakta acara
--
-- `start_time`/`end_time` bertipe `time`, BUKAN timestamptz.
--
-- `events.event_date` sudah dipakai di rundown, email, ekspor, dan layar
-- pendaftaran. Menambah timestamptz berarti tanggal acara punya dua sumber
-- kebenaran yang bisa berbeda, dan yang salah tidak akan pernah gagal build —
-- ia hanya menampilkan tanggal berbeda di dua layar. Jam disimpan terpisah lalu
-- digabung dengan `event_date` dan `time_zone` saat dibutuhkan.
--
-- `end_date` untuk acara lebih dari satu hari. NULL berarti acara sehari.
-- ---------------------------------------------------------------------------
alter table public.events add column if not exists start_time time;
alter table public.events add column if not exists end_time time;
alter table public.events add column if not exists end_date date;
alter table public.events add column if not exists tagline text;
alter table public.events add column if not exists venue_name text;
alter table public.events add column if not exists venue_address text;
alter table public.events add column if not exists venue_map_url text;

comment on column public.events.start_time is
  'Jam mulai. Digabung dengan event_date dan time_zone; disimpan terpisah supaya tanggal acara tetap punya satu sumber kebenaran.';
comment on column public.events.end_date is
  'Hanya untuk acara lebih dari satu hari. NULL berarti acara berakhir di event_date.';
comment on column public.events.venue_map_url is
  'Tautan peta (Google Maps dan sejenisnya). Ditampilkan sebagai tombol, tidak pernah disematkan sebagai iframe — penyemat peta memuat skrip pihak ketiga ke halaman yang dibuka tamu.';

-- Acara tidak boleh berakhir sebelum dimulai. Diperiksa di database, bukan hanya
-- di form: tanggal terbalik membuat penanda "sedang berlangsung" di rundown dan
-- hitung mundur di landing page keduanya salah, tanpa satu pun galat muncul.
alter table public.events drop constraint if exists events_end_after_start;
alter table public.events add constraint events_end_after_start
  check (end_date is null or event_date is null or end_date >= event_date);

-- ---------------------------------------------------------------------------
-- 2. Konten halaman
--
-- Satu jsonb, bukan tabel. Isinya dibaca seluruhnya sekaligus setiap kali
-- halaman dirender dan tidak pernah dikueri per bagian, jadi tabel dengan baris
-- per bagian hanya menambah join tanpa menambah kemampuan.
--
-- Bentuknya (semua opsional):
--   {
--     "banner_url": "https://…",
--     "cta_label": "Daftar sekarang",
--     "sections": [ { "id": "about", "enabled": true }, … ],
--     "highlights": [ { "label": "Peserta", "value": "300+" } ],
--     "faq": [ { "q": "…", "a": "…" } ],
--     "contact_name": "…", "contact_phone": "…", "contact_email": "…",
--     "theme": { "seed": "#2649D0", "roles": { … } }
--   }
--
-- `sections` menyimpan urutan DAN keaktifan sekaligus. Dua daftar terpisah akan
-- menyimpang begitu ada bagian baru ditambahkan di kode.
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists landing_config jsonb not null default '{}'::jsonb;

comment on column public.events.landing_config is
  'Konten dan susunan landing page publik. Fakta acara (jam, venue, tagline) TIDAK di sini — ia kolom tersendiri karena dibaca juga oleh email, rundown, dan berkas kalender.';

-- ---------------------------------------------------------------------------
-- 3. Duplikasi event ikut membawa landing page
--
-- `duplicate_event` menyalin kolom satu per satu. Kolom baru yang tidak
-- ditambahkan ke sana akan hilang diam-diam pada setiap event hasil salinan —
-- kegagalan yang baru ketahuan saat panitia membuka landing page acara tahun
-- berikutnya dan menemukannya kosong.
--
-- Fungsi aslinya dibaca ulang dan ditulis lengkap; menambal lewat ALTER tidak
-- mungkin untuk fungsi.
-- ---------------------------------------------------------------------------
do $$
declare
  sumber_def text;
begin
  select pg_get_functiondef(p.oid) into sumber_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'duplicate_event'
  limit 1;

  if sumber_def is null then
    raise notice 'duplicate_event tidak ditemukan; lewati penyesuaian kolom landing.';
    return;
  end if;

  -- Disisipkan lewat penggantian teks, bukan penulisan ulang seluruh fungsi:
  -- fungsi itu panjang dan sering berubah, dan menyalinnya ke sini membuat dua
  -- versi yang harus dijaga tetap sama.
  if position('landing_config' in sumber_def) = 0 then
    sumber_def := replace(sumber_def,
      'scanner_api_event_slug, registration_enabled, registration_form_config, time_zone, created_by)',
      'scanner_api_event_slug, registration_enabled, registration_form_config, time_zone, created_by, tagline, venue_name, venue_address, venue_map_url, start_time, end_time, landing_config)');
    sumber_def := replace(sumber_def,
      'daftar_publik, sumber.registration_form_config, sumber.time_zone, p_actor)',
      'daftar_publik, sumber.registration_form_config, sumber.time_zone, p_actor, sumber.tagline, sumber.venue_name, sumber.venue_address, sumber.venue_map_url, sumber.start_time, sumber.end_time, sumber.landing_config)');
    execute sumber_def;
  end if;
end $$;
