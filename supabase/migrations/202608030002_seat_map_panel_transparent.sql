-- Pilihan denah transparan di atas gambar latar.
--
-- Sejak `background_image_url` ada, satu agenda bisa punya gambar latar. Tapi
-- denahnya sendiri tetap digambar dengan kotak `background_color` solid, jadi
-- gambar itu hanya terlihat di pinggir halaman dan tertutup persis di bagian
-- tengah yang paling luas. Panitia tidak punya cara untuk menembusnya.
--
-- Kenapa kolom boolean, bukan nilai 'transparent' pada `background_color`:
-- `background_color` dipakai untuk DUA hal. Selain mengisi kanvas denah, warna
-- itu juga menjadi warna teks di atas bentuk terang (nomor meja, label panggung,
-- kursi kosong). Menyetelnya 'transparent' membuat nomor meja ikut hilang, dan
-- pada mode LED seluruh halaman jatuh ke latar terang bawaan situs sehingga teks
-- putih tidak terbaca sama sekali. Jadi transparansi dibatasi pada panel denah,
-- dan warna tetap wajib berbentuk hex.
--
-- Default false: seluruh agenda yang sudah ada tetap tampil sama setelah migrasi
-- ini dijalankan. Transparansi adalah pilihan yang diambil admin, bukan perubahan
-- tampilan yang terjadi diam-diam pada acara yang sedang berjalan.

alter table public.seat_map_sessions
  add column if not exists map_panel_transparent boolean not null default false;

comment on column public.seat_map_sessions.map_panel_transparent is
  'True berarti kanvas denah dibuat tembus pandang agar background_image_url terlihat di belakang meja. Warna background_color tetap dipakai sebagai warna teks kontras.';
