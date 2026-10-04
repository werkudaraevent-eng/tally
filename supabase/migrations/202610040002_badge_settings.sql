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
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

-- Tanpa policy: hanya service role (route handler admin) yang membaca dan
-- menulis, sama dengan label_settings.
alter table public.badge_settings enable row level security;
revoke all on table public.badge_settings from public, anon, authenticated;

comment on table public.badge_settings is
  'Rupa badge kertas (format lipat, latar, isi depan dan belakang) per acara. Lihat src/lib/badge/layout.ts.';
