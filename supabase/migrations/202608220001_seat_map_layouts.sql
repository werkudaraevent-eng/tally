-- ---------------------------------------------------------------------------
-- Jenis tata ruang untuk denah kursi.
--
-- Sebelum ini denah hanya mengenal satu bentuk: meja bundar berbaris. Ballroom
-- dipakai untuk lebih dari itu — theater untuk seminar, classroom untuk
-- workshop, U-shape dan hollow square untuk rapat, boardroom untuk direksi, dan
-- meja utama di depan meja bundar untuk gala.
--
-- Yang disimpan hanya PILIHAN dan PARAMETERNYA; koordinat tetap dihitung di
-- aplikasi (src/lib/seat-map-layouts.ts). Menyimpan koordinat per meja hanya
-- membuka peluang meja tersimpan tumpang tindih atau keluar kanvas, dan
-- kesalahan seperti itu baru terlihat saat sudah tampil di depan tamu.
--
-- `layout_params` satu bentuk datar untuk semua layout, bukan bentuk yang
-- berganti mengikuti `layout_type`. Dengan begitu mengganti layout hanya
-- mengubah field mana yang DIBACA — setelan layout sebelumnya tetap tersimpan,
-- jadi kembali ke sana tidak berarti mengisi ulang semuanya dari nol.
--
-- Bawaan 'banquet_round' dengan parameter kosong: setiap denah yang sudah ada
-- tetap tampil persis seperti sebelumnya, tanpa satu piksel pun berubah.
-- ---------------------------------------------------------------------------

alter table public.seat_maps
  add column if not exists layout_type text not null default 'banquet_round',
  add column if not exists layout_params jsonb not null default '{}'::jsonb;

-- CHECK, bukan enum: menambah layout baru kelak cukup mengubah satu batasan,
-- sedangkan menambah nilai enum di Postgres tidak dapat dibatalkan dalam
-- transaksi yang sama dan menyulitkan migrasi mundur.
alter table public.seat_maps
  drop constraint if exists seat_maps_layout_type_check;

alter table public.seat_maps
  add constraint seat_maps_layout_type_check
  check (layout_type in (
    'banquet_round',
    'cabaret',
    'theater',
    'classroom',
    'u_shape',
    'hollow_square',
    'boardroom',
    'head_table'
  ));
