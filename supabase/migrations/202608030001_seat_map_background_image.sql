-- Gambar latar per agenda denah.
--
-- Live Display top spender sudah punya `display_settings.background_image_url`
-- lengkap dengan endpoint upload dan bucket `display-assets`. Halaman denah hanya
-- punya warna solid, padahal keduanya sama-sama tampil di LED ruangan yang sama.
-- Akibatnya panitia tidak dapat menyeragamkan tampilan kedua layar.
--
-- Kolom ini nullable dan TIDAK punya nilai bawaan: null berarti "pakai warna
-- solid", persis perilaku yang berjalan sekarang. Jadi seluruh agenda yang sudah
-- ada tidak berubah tampilannya setelah migrasi ini dijalankan.
--
-- Disimpan per agenda, bukan satu untuk semua, karena tiap agenda sudah punya
-- warnanya sendiri (meeting pagi biru, gala malam merah). Latar yang dipaksa sama
-- akan bertabrakan dengan warna aksen salah satu agenda.
--
-- Tidak ada validasi bentuk URL di tingkat kolom. Nilainya hanya boleh datang dari
-- endpoint upload yang mengembalikan URL publik Supabase Storage, dan lapisan API
-- sudah memvalidasinya dengan `z.string().url()`. Constraint tambahan di sini akan
-- menolak URL sah dari bucket lain bila kelak bucket-nya dipindah.

alter table public.seat_map_sessions
  add column if not exists background_image_url text;

comment on column public.seat_map_sessions.background_image_url is
  'URL publik gambar latar agenda denah. Null berarti memakai background_color.';
