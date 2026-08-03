-- ---------------------------------------------------------------------------
-- Branding header halaman /rundown.
--
-- Menumpang sistem yang sudah ada, bukan membuat yang baru. Kolomnya diberi nama
-- IDENTIK dengan `seat_map_sessions` dan `display_settings` sehingga
-- `BRANDING_COLUMNS`, `normalizeBranding()`, dan komponen `<BrandingEditor>` yang
-- sudah dipakai /admin/seat-map dan /admin/display langsung melayani halaman ini
-- tanpa satu baris logika baru. Lihat alasannya di src/lib/branding.ts: begitu
-- bentuknya berbeda, setiap penambahan field kelak harus dikerjakan tiga kali dan
-- satu yang terlewat membuat dua layar di ruangan yang sama tampil beda aturan.
--
-- `title` dan `subtitle` sudah ada sejak 202608030004, jadi tidak dibuat ulang.
--
-- PERBEDAAN PENTING dari seat_map_sessions: warna di sini boleh NULL.
--
-- seat_map_sessions memakai default tidak-null ('#111a63' biru gelap) karena LED
-- memang dirancang gelap. /rundown sebaliknya: ia halaman terang yang dibuka tamu
-- di ponsel, dan sudah tayang. Memberi default gelap berarti begitu migrasi
-- dijalankan seluruh halaman berubah drastis tanpa ada yang memintanya. Dengan
-- NULL berarti "ikut tema bawaan halaman", janji fitur ini tetap sama dengan
-- fitur branding sebelumnya: tanpa satu pun field diisi, tampilannya PERSIS
-- seperti sebelum kolom ini ada.
-- ---------------------------------------------------------------------------

alter table public.rundown_sections
  -- Warna dasar header. Null = ikut --surface / --ink / --brand dari tema.
  add column if not exists background_color text,
  add column if not exists text_color text,
  add column if not exists accent_color text,

  -- Gambar latar header. Diisi hanya lewat endpoint upload /api/display/background
  -- yang sudah memvalidasi jenis dan ukuran berkas.
  add column if not exists background_image_url text,

  -- Kolom branding bersama, sama persis dengan dua tabel lain.
  add column if not exists logo_url text,
  add column if not exists logo_scale numeric(4, 2) not null default 1.00,
  add column if not exists footer_image_url text,
  add column if not exists footer_image_scale numeric(4, 2) not null default 1.00,
  add column if not exists footer_text text,
  add column if not exists heading_font branding_font not null default 'sans',
  add column if not exists title_scale numeric(4, 2) not null default 1.00,
  add column if not exists subtitle_scale numeric(4, 2) not null default 1.00,
  add column if not exists footer_scale numeric(4, 2) not null default 1.00,
  add column if not exists title_color text,
  add column if not exists subtitle_color text,
  add column if not exists footer_text_color text;

-- ---------------------------------------------------------------------------
-- Warna dijaga di database, bukan hanya di form.
--
-- Nilai non-hex yang lolos masuk akan dirender sebagai properti CSS tak sah, dan
-- akibatnya bukan error yang terlihat melainkan warna yang diam-diam diabaikan
-- browser — sulit disadari justru karena halamannya tetap tampil.
--
-- Ditulis idempoten supaya migrasi aman dijalankan ulang.
-- ---------------------------------------------------------------------------
do $$
declare
  col text;
begin
  foreach col in array array[
    'background_color', 'text_color', 'accent_color',
    'title_color', 'subtitle_color', 'footer_text_color'
  ] loop
    execute format(
      'alter table public.rundown_sections drop constraint if exists %I',
      'rundown_sections_' || col || '_hex'
    );
    execute format(
      'alter table public.rundown_sections add constraint %I check (%I is null or %I ~ ''^#[0-9a-fA-F]{6}$'')',
      'rundown_sections_' || col || '_hex', col, col
    );
  end loop;
end $$;

-- Skala dibatasi 0,5-2 sama seperti dua tabel lain. Di luar rentang itu judul
-- either hilang atau menutupi jadwalnya.
do $$
declare
  col text;
begin
  foreach col in array array['logo_scale', 'footer_image_scale', 'title_scale', 'subtitle_scale', 'footer_scale'] loop
    execute format(
      'alter table public.rundown_sections drop constraint if exists %I',
      'rundown_sections_' || col || '_range'
    );
    execute format(
      'alter table public.rundown_sections add constraint %I check (%I between 0.5 and 2)',
      'rundown_sections_' || col || '_range', col
    );
  end loop;
end $$;

comment on column public.rundown_sections.background_color is
  'Warna dasar header /rundown. NULL berarti ikut tema bawaan halaman (--surface), bukan berarti tanpa warna. Berbeda dari seat_map_sessions yang default-nya gelap, karena /rundown adalah halaman terang yang sudah tayang.';
comment on column public.rundown_sections.background_image_url is
  'Gambar latar header. Hanya diisi lewat /api/display/background yang sudah memvalidasi jenis dan ukuran berkas.';
