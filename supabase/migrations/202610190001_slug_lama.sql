-- ============================================================================
-- Slug lama acara: tautan lama tetap sampai setelah slug acara diganti.
-- Diminta Hanung 2026-10-19 (KSO berganti nama, slug-nya ikut diganti).
--
-- Slug masuk ke setiap tautan yang sudah tersebar (email konfirmasi, atur kata
-- sandi, halaman QR kehadiran, undangan, portal di layar utama, bookmark
-- scanner). Mengganti events.slug saja membuat semuanya 404. Tabel ini
-- menyimpan slug lama -> acara, dan proxy mengalihkan /e/<lama>/...,
-- /peserta/e/<lama>/... dan ?eventSlug=<lama> ke slug sekarang
-- (src/lib/slug-lama.ts). Acara baru tidak diberi slug yang ada di sini.
--
-- Hanya menambah satu tabel kosong. Tidak ada data yang diubah; setiap acara
-- berubah 0 px. Hanya service role yang membacanya (proxy dan pembuat slug),
-- jadi RLS menyala tanpa policy dan hak anon/authenticated dicabut.
-- Satu transaksi, aman dijalankan ulang.
--
-- Aman sebelum atau sesudah kodenya tayang: kode membaca tabel yang belum ada
-- sebagai "belum ada slug lama".
-- ============================================================================

begin;

set local lock_timeout = '5s';

create table if not exists public.event_slug_redirects (
  old_slug text primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Bentuk yang sama dengan events_slug_format: slug lama pernah jadi slug sah.
  constraint event_slug_redirects_format check (old_slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$')
);

create index if not exists event_slug_redirects_event_id_idx on public.event_slug_redirects (event_id);

alter table public.event_slug_redirects enable row level security;
revoke all on table public.event_slug_redirects from public, anon, authenticated;
grant select, insert, update, delete on table public.event_slug_redirects to service_role;

comment on table public.event_slug_redirects is
  'Slug lama acara yang sudah ganti slug. Proxy mengalihkan alamat ber-slug lama ke slug acara sekarang; acara baru tidak diberi slug yang ada di sini.';

commit;

notify pgrst, 'reload schema';
