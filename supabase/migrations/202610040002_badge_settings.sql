-- Badge kertas: rupa badge yang dicetak di printer kantor, satu baris per acara.
--
-- Terpisah dari `label_settings` (printer label NIIMBOT) karena keduanya hidup
-- berdampingan dengan setelan yang tidak sama: label adalah gambar berpiksel
-- untuk printer termal, badge adalah susunan bermilimeter untuk dialog cetak.
--
-- Seluruh susunan ada di satu kolom jsonb berversi (`v`), sama seperti
-- `label_settings.layout`: format kertas, latar, dan isi depan/belakang
-- berubah bersama dan dibaca bersama. Bentuknya divalidasi di aplikasi
-- (src/lib/badge/schema.ts) saat disimpan DAN saat dibaca.
--
-- Profil printer (kalibrasi geser) TIDAK disimpan di sini: ia milik laptop
-- yang mencetak, bukan milik acara, dan disimpan di perangkat itu.

create table if not exists public.badge_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  layout jsonb not null,
  -- Badge kertas yang dicetak di meja registrasi. Satu dari tiga pilihan
  -- "Yang dicetak di meja registrasi"; pilihan label stiker tetap disimpan di
  -- label_settings.enabled supaya layar scan yang sudah ada tidak berubah.
  di_meja boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

-- Untuk basis data yang sudah menjalankan versi awal berkas ini, sebelum kolom
-- di_meja ada: `create table if not exists` di atas tidak menyentuh tabel lama.
alter table public.badge_settings add column if not exists di_meja boolean not null default false;

-- Tanpa policy: hanya service role (route handler admin) yang membaca dan
-- menulis, sama dengan label_settings.
alter table public.badge_settings enable row level security;
revoke all on table public.badge_settings from public, anon, authenticated;

comment on table public.badge_settings is
  'Rupa badge kertas (format lipat, latar, isi depan dan belakang) per acara. Lihat src/lib/badge/layout.ts.';
