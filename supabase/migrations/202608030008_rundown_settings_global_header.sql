-- ---------------------------------------------------------------------------
-- Header halaman /rundown dipindah menjadi setelan GLOBAL.
--
-- Migrasi 202608030007 menaruh judul dan branding header di `rundown_sections`,
-- yaitu per tab. Itu keliru, dan akibatnya baru terlihat setelah dipakai: berpindah
-- tab mengubah seluruh identitas halaman. Panitia menyetel biru dan logo pada tab
-- Executive Gathering, lalu tab Prima Awards tampil putih tanpa logo — satu
-- halaman yang seolah berganti menjadi situs lain di tengah pemakaian.
--
-- Header adalah identitas ACARA, bukan identitas satu agenda. Yang memang berbeda
-- per tab hanyalah jadwalnya, tanggalnya, dan label tabnya.
--
-- Kolom lama di `rundown_sections` sengaja TIDAK dihapus:
--   * nilainya disalin ke sini lebih dulu, jadi tidak ada yang hilang;
--   * menghapus kolom tidak bisa dibalik, dan tidak ada yang mendesak untuk
--     melakukannya tiga hari sebelum acara.
-- Kolom itu berhenti dibaca aplikasi. Pembersihannya dijadwalkan setelah acara.
-- ---------------------------------------------------------------------------

create table if not exists public.rundown_settings (
  -- Singleton, pola yang sama dengan event_settings dan display_settings.
  id int primary key default 1 check (id = 1),

  -- Judul dan sub judul acara, tampil sama di seluruh tab.
  event_title text not null default 'Rundown Acara',
  event_subtitle text,

  -- Warna dasar header. NULL berarti "ikut tema bawaan halaman", bukan "tanpa
  -- warna". Alasannya sama dengan migrasi sebelumnya: /rundown adalah halaman
  -- terang yang sudah tayang, jadi default berwarna akan mengubah tampilan tanpa
  -- ada yang meminta.
  background_color text,
  text_color text,
  accent_color text,
  background_image_url text,

  -- Kolom branding bersama. Nama dibuat IDENTIK dengan seat_map_sessions dan
  -- display_settings supaya BRANDING_COLUMNS, normalizeBranding(), dan komponen
  -- <BrandingEditor> yang sudah ada langsung melayani tabel ini juga.
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
  updated_by uuid references public.users(id),

  constraint rundown_settings_background_color_hex check (background_color is null or background_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint rundown_settings_text_color_hex check (text_color is null or text_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint rundown_settings_accent_color_hex check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint rundown_settings_title_color_hex check (title_color is null or title_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint rundown_settings_subtitle_color_hex check (subtitle_color is null or subtitle_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint rundown_settings_footer_text_color_hex check (footer_text_color is null or footer_text_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint rundown_settings_logo_scale_range check (logo_scale between 0.5 and 2),
  constraint rundown_settings_footer_image_scale_range check (footer_image_scale between 0.5 and 2),
  constraint rundown_settings_title_scale_range check (title_scale between 0.5 and 2),
  constraint rundown_settings_subtitle_scale_range check (subtitle_scale between 0.5 and 2),
  constraint rundown_settings_footer_scale_range check (footer_scale between 0.5 and 2)
);

-- ---------------------------------------------------------------------------
-- Baris singleton diisi dari setelan yang SUDAH disetel panitia, bukan dari nilai
-- kosong. Kalau diisi kosong, kerja menyetel biru dan mengunggah logo tadi hilang
-- dan harus diulang tanpa ada yang tahu mengapa.
--
-- Diambil dari bagian yang paling lengkap brandingnya: yang punya warna latar
-- atau logo lebih dulu, baru urutan tampil. Judulnya sengaja TIDAK diambil dari
-- section (judul section adalah nama agendanya, mis. "PRIMA AWARDS"), melainkan
-- dari nama acara yang berlaku umum.
-- ---------------------------------------------------------------------------
insert into public.rundown_settings (
  id, event_title, event_subtitle,
  background_color, text_color, accent_color, background_image_url,
  logo_url, logo_scale, footer_image_url, footer_image_scale, footer_text,
  heading_font, title_scale, subtitle_scale, footer_scale,
  title_color, subtitle_color, footer_text_color
)
select
  1,
  'PRIMA EXECUTIVE GATHERING',
  src.subtitle,
  src.background_color, src.text_color, src.accent_color, src.background_image_url,
  src.logo_url, src.logo_scale, src.footer_image_url, src.footer_image_scale, src.footer_text,
  src.heading_font, src.title_scale, src.subtitle_scale, src.footer_scale,
  src.title_color, src.subtitle_color, src.footer_text_color
from (
  select * from public.rundown_sections
  order by
    (background_color is not null or logo_url is not null or background_image_url is not null) desc,
    sort_order, id
  limit 1
) as src
on conflict (id) do nothing;

-- Tabel kosong (belum ada section sama sekali) tetap harus punya baris singleton.
insert into public.rundown_settings (id) values (1) on conflict (id) do nothing;

-- Keamanan mengikuti pola seluruh tabel lain: tidak ada akses langsung dari
-- klien, semua lewat route handler yang memakai service role.
alter table public.rundown_settings enable row level security;
revoke all on table public.rundown_settings from anon, authenticated;

comment on table public.rundown_settings is
  'Header halaman /rundown: judul acara, sub judul, dan branding. Singleton karena header adalah identitas ACARA, bukan identitas satu agenda. Sebelumnya per section, dan berpindah tab mengubah seluruh tampilan halaman.';
comment on column public.rundown_settings.event_title is
  'Judul yang tampil sama di semua tab. Tidak lagi mengikuti nama tab yang sedang aktif.';
