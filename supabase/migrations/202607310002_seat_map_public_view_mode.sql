-- Mode tampilan halaman denah publik.
--
-- Ada dua jenis layar dengan cara pakai yang berbeda:
--
--   * `search` — layar sentuh atau HP tamu. Tamu mengetik namanya, kursinya
--     disorot. Ini mode yang sudah ada.
--   * `qr` — LED publik tanpa sentuh. Tidak ada yang bisa mengetik, jadi layar
--     menampilkan QR besar yang mengarah ke halaman yang sama. Tamu memindai
--     dengan HP-nya sendiri, lalu memakai mode `search` di sana.
--
-- Kenapa LED tidak menampilkan daftar nama saja: itu berarti memajang nama
-- ratusan peserta di ruang terbuka. QR memindahkan pencarian ke HP masing-masing
-- sehingga nama tidak pernah tampil di layar besar.
--
-- Disimpan di `seat_maps` (global), bukan per sesi: ini sifat layarnya, bukan
-- sifat acaranya. Untuk layar yang butuh mode berbeda pada waktu yang sama,
-- halaman publik menerima `?mode=` sebagai penimpa per layar.

alter table public.seat_maps
  add column if not exists public_view_mode text not null default 'search';

alter table public.seat_maps
  drop constraint if exists seat_maps_public_view_mode_valid;

alter table public.seat_maps
  add constraint seat_maps_public_view_mode_valid
  check (public_view_mode in ('search', 'qr'));
