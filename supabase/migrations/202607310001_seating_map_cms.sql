-- Denah tempat duduk: CMS + public view.
--
-- Kenapa tabel baru sepenuhnya, tanpa mengubah tabel lama: alur booth, cashier,
-- dan order sudah dipakai dan tidak boleh terganggu. Fitur ini hanya MEMBACA
-- `participants.seats` (kolom yang sudah diisi sinkronisasi scanner API), jadi
-- tidak ada satu pun kolom lama yang diubah, dihapus, atau ditambah.
--
-- Pembagian tanggung jawab yang dipegang di seluruh fitur:
--   * Penempatan orang (siapa duduk di mana) MILIK scanner API, read-only.
--   * Geometri ruangan (meja nomor berapa ada di mana) tidak ada di API, dan
--     itulah yang disimpan di sini.
-- Kalau penempatan ikut bisa diedit di sini, hari H akan ada dua sumber
-- kebenaran yang berbeda dan tidak ada yang tahu mana yang benar.

-- ---------------------------------------------------------------------------
-- Geometri ruangan. Parametrik, bukan koordinat per meja.
--
-- Denah acara ini sangat teratur (4 baris: 8, 9, 8, 7 meja), jadi menyimpan
-- x/y tiap meja hanya mengundang masalah: meja bisa tersimpan tumpang tindih
-- atau keluar kanvas, dan itu baru kelihatan di depan tamu. Dengan parametrik,
-- posisi dihitung dari konfigurasi sehingga selalu rapi.
-- ---------------------------------------------------------------------------
create table if not exists public.seat_maps (
  id int primary key default 1 check (id = 1),
  name text not null default 'Ballroom PRIMA 2026',
  stage_label text not null default 'LED SCREEN',

  -- Jumlah meja per baris, dari baris terdepan (paling dekat panggung).
  -- Contoh acara ini: [8, 9, 8, 7].
  row_table_counts jsonb not null default '[8, 9, 8, 7]'::jsonb,

  -- Jumlah kursi per meja, sebagai daftar rentang nomor meja.
  -- Contoh: meja 1-25 enam kursi, meja 26-32 tujuh kursi.
  seat_rules jsonb not null default '[{"from": 1, "to": 25, "seats": 6}, {"from": 26, "to": 32, "seats": 7}]'::jsonb,

  -- Pola label kursi, dipakai untuk mencocokkan dengan `seats[].label` dari API.
  -- Token yang dikenali: {table} dan {seat}. Contoh "{table}{seat}" -> "12C".
  --
  -- Ini titik paling rawan di seluruh fitur. Pencocokan denah dengan peserta
  -- bergantung pada string label yang sama persis. Disimpan sebagai pola
  -- (bukan hasil parsing tebakan) supaya kalau panitia memakai gaya penulisan
  -- lain, admin cukup mengganti satu pola dan seluruh label ikut benar.
  seat_label_pattern text not null default '{table}{seat}',

  -- Penyimpangan opsional per meja, misalnya karena ada pilar di ruangan.
  -- Bentuk: {"12": {"dx": 20, "dy": -10}}. dx/dy dalam satuan koordinat kanvas.
  table_overrides jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id),

  constraint seat_maps_rows_is_array check (jsonb_typeof(row_table_counts) = 'array'),
  constraint seat_maps_rules_is_array check (jsonb_typeof(seat_rules) = 'array'),
  constraint seat_maps_overrides_is_object check (jsonb_typeof(table_overrides) = 'object'),
  constraint seat_maps_pattern_has_tokens check (seat_label_pattern like '%{table}%' and seat_label_pattern like '%{seat}%')
);

insert into public.seat_maps (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Sesi acara. Geometri sama, penempatan orang dan tampilan berbeda.
--
-- Ada dua agenda: meeting pagi dan gala malam. Layoutnya identik, hanya
-- assignment per orang dan warna/judul yang beda. Karena itu geometri dipakai
-- bersama (referensi ke seat_maps) dan TIDAK digandakan. Kalau digandakan,
-- koreksi layout harus dikerjakan dua kali dan begitu satu terlupakan, denah
-- pagi dan malam berbeda tanpa ada yang sadar.
-- ---------------------------------------------------------------------------
create table if not exists public.seat_map_sessions (
  id serial primary key,

  -- Dipakai di URL publik: /denah?sesi=<slug>. Huruf kecil, angka, dan tanda -.
  slug text unique not null,
  name text not null,

  -- `subEventId` dari scanner API. Kunci untuk memilih entri `seats` yang benar
  -- milik sesi ini. Sengaja pakai id, bukan nama: nama bisa diubah panitia
  -- kapan saja, sedangkan id semestinya stabil.
  -- Boleh null selama panitia belum mengisi data kursi di sumber.
  sub_event_id text,

  seat_map_id int not null default 1 references public.seat_maps(id),

  title text not null,
  subtitle text,
  background_color text not null default '#111a63',
  text_color text not null default '#ffffff',
  accent_color text not null default '#f2c14e',

  -- Tamu hanya melihat sesi yang sudah dipublikasikan. Ini yang memungkinkan
  -- admin menata denah lebih dulu tanpa langsung tampil ke publik.
  is_published boolean not null default false,

  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id),

  constraint seat_map_sessions_slug_format check (slug ~ '^[a-z0-9-]{2,40}$'),
  constraint seat_map_sessions_bg_hex check (background_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint seat_map_sessions_ink_hex check (text_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint seat_map_sessions_accent_hex check (accent_color ~ '^#[0-9a-fA-F]{6}$')
);

create index if not exists seat_map_sessions_published_idx
  on public.seat_map_sessions (is_published, sort_order);

-- Dua sesi acara ini. Dibuat belum publish supaya admin menata dulu.
insert into public.seat_map_sessions (slug, name, title, subtitle, background_color, accent_color, sort_order)
values
  ('meeting-pagi', 'Agenda Pagi — Meeting', 'PRIMA EXECUTIVE GATHERING 2026', 'Seating Arrangement', '#111a63', '#f2c14e', 1),
  ('gala-malam', 'Agenda Malam — Gala', 'PRIMA AWARDS 2026', 'Seating Arrangement', '#6d0618', '#f2c14e', 2)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Keamanan: ikut pola display_settings. Tidak ada akses langsung dari klien;
-- semua lewat route handler yang memakai service role, sehingga aturan siapa
-- boleh baca/tulis diputuskan di satu tempat di aplikasi.
-- ---------------------------------------------------------------------------
alter table public.seat_maps enable row level security;
alter table public.seat_map_sessions enable row level security;

revoke all on table public.seat_maps from anon, authenticated;
revoke all on table public.seat_map_sessions from anon, authenticated;
revoke all on sequence public.seat_map_sessions_id_seq from anon, authenticated;
