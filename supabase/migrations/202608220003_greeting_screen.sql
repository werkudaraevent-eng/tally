-- ---------------------------------------------------------------------------
-- Layar sapa: menyambut peserta dengan namanya begitu ia dipindai di pintu.
--
-- Datanya sudah ada seluruhnya — `attendance_scans` mencatat setiap pemindaian
-- beserta jamnya, dan `participants` menyimpan nama serta instansinya. Yang
-- belum ada adalah TAMPILANNYA: warna, orientasi, berapa lama satu nama
-- bertahan, dan apakah pemindaian ulang ikut disapa.
--
-- Karena itu migrasi ini tidak menambah satu pun tabel data. Ia hanya menambah
-- satu baris konfigurasi per acara.
--
-- ---- Kenapa satu baris per acara, bukan satu baris tunggal -----------------
--
-- Sistem ini sudah multi-event sejak 202608070001. Konfigurasi tunggal berarti
-- dua acara yang berjalan di gedung yang sama berbagi warna dan orientasi layar,
-- dan yang mengubahnya untuk acara sore diam-diam mengubah layar acara pagi yang
-- masih menyala di lobi.
--
-- ---- Kenapa kolom brandingnya bernama persis seperti di display_settings ---
--
-- `normalizeBranding()` dan komponen header/footer di aplikasi membaca kolom
-- berdasarkan NAMA. Menyamakan namanya berarti satu fungsi normalisasi dan satu
-- komponen render melayani papan peringkat, denah kursi, dan layar sapa
-- sekaligus. Kalau masing-masing punya bentuk sendiri, penambahan field
-- berikutnya harus dikerjakan tiga kali — dan begitu satu terlewat, tiga layar
-- di ruangan yang sama tampil dengan aturan berbeda.
-- ---------------------------------------------------------------------------

create table if not exists public.greeting_settings (
  -- event_id sekaligus primary key: satu acara punya tepat satu layar sapa.
  -- Kunci pengganti hanya akan membuat baris kedua untuk acara yang sama
  -- menjadi mungkin, dan tidak ada satu pun kueri yang tahu mana yang benar.
  event_id uuid primary key references public.events(id) on delete cascade,

  is_enabled boolean not null default true,

  -- Orientasi ditentukan di CMS, bukan dari ukuran jendela.
  --
  -- Layar sapa dipasang di TV yang diputar berdiri di dekat pintu masuk sama
  -- seringnya dengan di proyektor melintang. Browser di TV melaporkan
  -- viewport-nya apa adanya, tetapi panel yang dipasang berdiri sering tetap
  -- melaporkan 1920x1080 dan memutar gambarnya di perangkat keras — jadi
  -- menebak dari lebar layar menghasilkan tata letak melintang di panel yang
  -- jelas-jelas berdiri.
  orientation text not null default 'landscape'
    check (orientation in ('landscape', 'portrait')),

  headline text not null default 'Selamat datang',
  -- Ditampilkan ketika belum ada yang dipindai belakangan ini. Bukan layar
  -- kosong: layar sapa menyala berjam-jam sebelum tamu pertama datang, dan
  -- bidang hitam kosong di lobi terbaca sebagai layar yang rusak.
  idle_message text not null default 'Silakan pindai QR Anda di meja registrasi',

  -- Sesi yang disapa. NULL berarti seluruh sesi acara ini.
  --
  -- `on delete set null`, bukan cascade: menghapus satu sesi kehadiran tidak
  -- boleh ikut menghapus seluruh konfigurasi layar sapa. Ia cukup kembali
  -- menyapa semua sesi.
  session_id bigint references public.attendance_sessions(id) on delete set null,

  -- Pemindaian ulang TIDAK disapa secara bawaan. Peserta yang keluar-masuk
  -- ruangan tiga kali akan menyapu nama tamu lain dari layar setiap kali ia
  -- lewat, dan yang paling sering keluar-masuk justru panitia.
  greet_duplicates boolean not null default false,

  -- Berapa detik satu nama bertahan sebelum digantikan yang berikutnya.
  hold_seconds int not null default 8 check (hold_seconds between 3 and 60),

  show_company boolean not null default true,
  -- Deretan nama yang baru saja masuk, di bawah/di samping nama utama. Ia yang
  -- membuat layar tetap hidup di antara dua kedatangan.
  show_recent boolean not null default true,
  recent_limit int not null default 6 check (recent_limit between 1 and 12),

  background_color text not null default '#101613',
  text_color text not null default '#f7f5ed',
  accent_color text not null default '#2649d0',
  background_image_url text,

  -- Kolom branding. Nama dan tipenya sengaja identik dengan `display_settings`
  -- dan `seat_map_sessions`; lihat catatan di kepala berkas.
  logo_url text,
  logo_scale numeric(4, 2) not null default 1.00,
  footer_image_url text,
  footer_image_scale numeric(4, 2) not null default 1.00,
  footer_text text,
  heading_font branding_font not null default 'sans',
  title_scale numeric(4, 2) not null default 1.00,
  subtitle_scale numeric(4, 2) not null default 1.00,
  footer_scale numeric(4, 2) not null default 1.00,
  title_color text,
  subtitle_color text,
  footer_text_color text,

  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

alter table public.greeting_settings enable row level security;
-- Tanpa policy: seluruh akses lewat service role di route handler, pola yang
-- sama dengan `display_settings` dan tabel setelan lain di aplikasi ini.

-- Indeks untuk umpan layar sapa yang disaring per sesi.
--
-- `attendance_scans_event_time_idx` sudah melayani "pemindaian terbaru di acara
-- ini", tetapi layar sapa yang dikunci ke satu sesi menyaring `session_id` lebih
-- dulu lalu mengurutkan waktu. Tanpa indeks ini Postgres membaca seluruh
-- pemindaian acara lalu membuang yang bukan sesinya — murah di pagi hari,
-- makin mahal setiap jam, dan yang membayarnya adalah layar yang melakukan
-- kueri ini setiap dua detik sepanjang acara.
create index if not exists attendance_scans_session_time_idx
  on public.attendance_scans (session_id, scanned_at desc);
