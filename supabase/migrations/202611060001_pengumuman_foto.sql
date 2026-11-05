-- ---------------------------------------------------------------------------
-- Pengumuman: satu foto opsional per pengumuman (Messages > Announcements >
-- Photo), mis. foto tim panitia yang menunggu di stasiun.
--
-- image_url = URL publik foto di bucket display-assets, folder pengumuman.
--             Server hanya menerima URL dari folder itu (src/lib/pengumuman-foto.ts);
--             CHECK di sini hanya pagar kasar: https dan panjang wajar.
-- image_alt = deskripsi foto untuk pembaca layar (WCAG 1.1.1). Kosong = judul.
--
-- Dua kolom nullable tanpa default: pengumuman yang sudah ada tetap tanpa foto,
-- peserta melihat 0 perubahan. Satu transaksi, aman dijalankan ulang. Kode aman
-- sebelum migrasi ini (membaca tanpa kolom foto, kolom Photo belum tampil).
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

alter table public.event_announcements
  add column if not exists image_url text,
  add column if not exists image_alt text;

alter table public.event_announcements
  drop constraint if exists event_announcements_image_url_check;

alter table public.event_announcements
  add constraint event_announcements_image_url_check check (
    image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 1000)
  );

alter table public.event_announcements
  drop constraint if exists event_announcements_image_alt_check;

alter table public.event_announcements
  add constraint event_announcements_image_alt_check check (
    image_alt is null or char_length(image_alt) <= 150
  );

comment on column public.event_announcements.image_url is
  'Satu foto opsional: URL publik di display-assets/pengumuman/. Null = tanpa foto.';
comment on column public.event_announcements.image_alt is
  'Deskripsi foto untuk pembaca layar. Null = judul pengumuman yang dipakai.';

commit;

notify pgrst, 'reload schema';
