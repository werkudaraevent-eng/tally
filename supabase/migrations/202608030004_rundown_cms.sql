-- ---------------------------------------------------------------------------
-- Rundown acara: CMS + halaman publik /rundown.
--
-- Tabel baru sepenuhnya, tidak ada kolom lama yang diubah. Alur booth, cashier,
-- order, dan denah sudah dipakai dan tidak boleh terganggu menjelang hari-H.
--
-- Kenapa tabel section sendiri, bukan menumpang `seat_map_sessions`:
-- dua nama yang muncul sebagai tab di rancangan klien ("PRIMA EXECUTIVE
-- GATHERING" dan "PRIMA AWARDS") memang sudah ada sebagai baris seat_map_sessions.
-- Tapi tabel itu bernama dan bercakupan seating: ia memegang `sub_event_id` dari
-- scanner API dan `seat_map_id`, dan halaman /denah yang sudah teruji bergantung
-- padanya. Menambah rundown ke sana berarti setiap perubahan rundown menyentuh
-- fitur yang sudah stabil, dan agenda yang belum punya denah tidak bisa punya
-- rundown tanpa lebih dulu memalsukan baris denah.
--
-- Harganya: nama acara ditulis di dua tempat. Itu ditukar sadar dengan tidak
-- menyentuh /denah sama sekali. Ketika tabel `events` di tasks/multi-event-plan.md
-- jadi dikerjakan, kedua tabel ini sama-sama menunjuk ke sana lewat satu kolom.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Section = satu tab di halaman publik.
--
-- `event_date` wajib, dan ini keputusan yang menentukan.
--
-- Item rundown menyimpan JAM saja (lihat alasan di bawah), sehingga tanpa tanggal
-- di section tidak ada cara menentukan apakah "08:30" itu hari ini, besok, atau
-- tahun lalu. Penanda "sedang berlangsung" yang diminta klien butuh jawaban itu.
-- Kalau tanggal tidak disimpan, penanda hanya bisa membandingkan jam dinding, dan
-- rundown gala malam akan tampak "sedang berlangsung" pada pagi hari sebelumnya —
-- persis jenis kesalahan yang terlihat oleh tamu, bukan oleh panitia.
--
-- Default hari ini hanya agar migrasi bisa jalan pada tabel kosong; setiap
-- section dibuat lewat CMS dengan tanggal yang dipilih admin.
-- ---------------------------------------------------------------------------
create table if not exists public.rundown_sections (
  id serial primary key,

  -- Dipakai di URL publik: /rundown?sesi=<slug>.
  slug text unique not null,

  -- Label tab. Sengaja dipisah dari `title`: tab harus pendek agar dua-tiga tab
  -- muat di layar ponsel, sedangkan judul halaman boleh panjang.
  name text not null,

  title text not null,
  subtitle text,

  event_date date not null default current_date,

  -- Tamu hanya melihat section yang sudah dipublikasikan, sehingga admin bisa
  -- menyusun rundown yang masih berubah tanpa langsung tampil ke publik.
  is_published boolean not null default false,

  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id),

  constraint rundown_sections_slug_format check (slug ~ '^[a-z0-9-]{2,40}$')
);

-- ---------------------------------------------------------------------------
-- Item = satu baris jadwal.
--
-- Kenapa `time` dan bukan `timestamptz`:
-- yang ditampilkan ke tamu adalah "07:30 – 08:30" tanpa tanggal, dan panitia
-- menyusunnya sebagai jam dinding lokasi acara. `timestamptz` memaksa setiap
-- penyimpanan dan pembacaan melewati konversi zona waktu, sehingga jam yang
-- diketik admin dari laptop ber-timezone salah akan tersimpan bergeser, dan itu
-- baru terlihat setelah rundown tayang. Dengan `time` + `event_date` di section,
-- yang tersimpan persis yang diketik; konversi ke WIB hanya terjadi sekali, saat
-- membandingkan dengan waktu sekarang untuk penanda sesi berjalan.
--
-- `end_time` boleh null: sebagian acara punya butir tanpa durasi (mis. "Ramah
-- tamah") dan memaksa admin mengarang jam selesai hanya membuat rundown salah.
--
-- `subtitle` adalah satu baris bebas, mengikuti rancangan klien yang mencampur
-- pembicara dan lokasi di baris abu-abu yang sama ("Abraham J. Adriaansz –
-- President Director PT. Rintis Sejahtera" dan "PRIMA Hub Nusantara Experience").
-- Memisahkannya menjadi kolom pembicara/jabatan/lokasi akan memaksa aplikasi
-- menyusun ulang kalimatnya, dan setiap butir yang tidak berpola rapi (moderator
-- plus tiga panelis) jadi tidak bisa ditulis apa adanya.
-- ---------------------------------------------------------------------------
create table if not exists public.rundown_items (
  id serial primary key,

  -- Item ikut terhapus bila section-nya dihapus: baris jadwal tanpa section
  -- tidak punya tanggal dan tidak akan pernah bisa ditampilkan.
  section_id int not null references public.rundown_sections(id) on delete cascade,

  start_time time not null,
  end_time time,

  title text not null,
  subtitle text,

  -- Menandai butir yang bukan acara, mis. "Coffee Break". Dipakai halaman publik
  -- untuk menampilkannya lebih redup agar mata tamu jatuh ke acara utama.
  is_break boolean not null default false,

  is_published boolean not null default true,

  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id),

  -- Jam selesai sebelum jam mulai hampir selalu salah ketik. Sengaja TIDAK
  -- melarang sama-dengan: butir berdurasi nol dipakai panitia untuk penanda
  -- momen (mis. "Opening Ceremony" pada 09:00).
  constraint rundown_items_time_order check (end_time is null or end_time >= start_time)
);

-- Halaman publik selalu membaca satu section, hanya yang publish, urut waktu.
create index if not exists rundown_items_section_idx
  on public.rundown_items (section_id, is_published, sort_order, start_time);

create index if not exists rundown_sections_published_idx
  on public.rundown_sections (is_published, sort_order);

-- ---------------------------------------------------------------------------
-- Dua section acara ini, mengikuti nama di rancangan klien. Dibuat BELUM publish
-- supaya admin menyusun isinya dulu; rundown kosong yang langsung publik tampil
-- sebagai halaman melompong ke tamu.
--
-- Tanggal sengaja dibiarkan default (hari migrasi dijalankan) dan bukan tanggal
-- acara yang ditebak di sini: menaruh tanggal karangan di database membuatnya
-- terlihat sudah disetel, sehingga tidak ada yang memeriksanya lagi. Admin
-- mengisinya di CMS.
-- ---------------------------------------------------------------------------
insert into public.rundown_sections (slug, name, title, subtitle, sort_order)
values
  ('executive-gathering', 'Prima Executive Gathering', 'PRIMA EXECUTIVE GATHERING', 'Event Schedule', 1),
  ('prima-awards', 'Prima Awards', 'PRIMA AWARDS', 'Event Schedule', 2)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Keamanan: ikut pola display_settings dan seat_maps. Tidak ada akses langsung
-- dari klien; semua lewat route handler yang memakai service role, sehingga
-- aturan siapa boleh baca/tulis diputuskan di satu tempat di aplikasi.
--
-- Sequence ikut dicabut. Tanpa itu, `serial` masih bisa dimajukan dari klien.
-- ---------------------------------------------------------------------------
alter table public.rundown_sections enable row level security;
alter table public.rundown_items enable row level security;

revoke all on table public.rundown_sections from anon, authenticated;
revoke all on table public.rundown_items from anon, authenticated;
revoke all on sequence public.rundown_sections_id_seq from anon, authenticated;
revoke all on sequence public.rundown_items_id_seq from anon, authenticated;

comment on column public.rundown_sections.event_date is
  'Tanggal berlangsungnya section. Wajib karena item menyimpan jam saja; tanpa ini penanda "sedang berlangsung" tidak bisa membedakan hari.';
comment on column public.rundown_sections.name is
  'Label tab di halaman publik. Dipisah dari title karena tab harus pendek agar muat di layar ponsel.';
comment on column public.rundown_items.subtitle is
  'Satu baris bebas untuk pembicara, jabatan, atau lokasi. Sengaja tidak dipecah per kolom agar butir yang tidak berpola tetap bisa ditulis apa adanya.';
comment on column public.rundown_items.end_time is
  'Boleh null untuk butir tanpa durasi. Memaksa jam selesai hanya membuat rundown mengarang.';
