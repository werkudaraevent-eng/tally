-- ---------------------------------------------------------------------------
-- Label meja yang menyimpang dari nomor urutnya.
--
-- Permintaan klien: "meja NO 4 TIDAK ADA, diganti NO 3A." Ini keyakinan yang
-- umum pada tamu Tionghoa — angka 4 (四, sì) berbunyi mirip mati (死, sǐ), jadi
-- nomor itu dihindari seperti lantai 13 di gedung Barat.
--
-- Yang diminta adalah LABEL, bukan lompatan nomor. Bedanya menentukan:
--
--   label:   1  2  3  3A  5  6 ...   <- meja ke-5 tetap bernomor 5
--   lompat:  1  2  3  5   6  7 ...   <- meja ke-5 menjadi 6, seluruh denah bergeser
--
-- Karena itu yang disimpan adalah pemetaan POSISI -> LABEL, dan posisi meja
-- tidak pernah berubah. Meja 5 sampai 32 tetap bernomor 5 sampai 32, jadi denah
-- cetak, kartu meja, dan penempatan yang sudah dibuat panitia tetap benar. Kalau
-- yang disimpan adalah daftar nomor yang dilewati, mengubah satu meja akan
-- menggeser 28 meja lainnya.
--
-- Bentuk: {"4": "3A"}. Kuncinya nomor posisi (meja ke-berapa dari depan,
-- menerus antar baris), nilainya label yang tampil. Hanya meja yang menyimpang
-- perlu ditulis; sisanya memakai nomor posisinya sendiri. Idiom ini sama dengan
-- `table_overrides` yang sudah ada di tabel ini, jadi tidak ada pola baru yang
-- harus dipelajari admin.
--
-- Kenapa `jsonb` object dan bukan array label lengkap ["1","2","3","3A",...]:
-- array menuntut admin mengisi 32 label dengan tangan, dan satu salah ketik
-- membuat satu meja tidak cocok dengan data peserta tanpa pesan kesalahan
-- apa pun. Object hanya memuat penyimpangan, jadi yang tidak diisi tidak
-- mungkin salah.
--
-- PENTING: label ini masuk ke label kursi lewat `seat_label_pattern`
-- ({seat}{table} -> "A3A", "B3A"), dan label kursi dicocokkan sama persis
-- dengan `participants.seats[].label` dari scanner API. Klien sudah memastikan
-- scanner mengirim "3A" juga. Bila suatu saat tidak cocok, gejalanya BUKAN
-- error melainkan peserta yang tidak muncul di denah — terbaca di CMS sebagai
-- `unmatched_labels`.
--
-- `seat_rules` dan `table_overrides` tetap memakai nomor POSISI, bukan label.
-- Dengan begitu konfigurasi yang sudah ada (meja 1-25 enam kursi, 26-32 tujuh
-- kursi) tetap berlaku tanpa disentuh, dan aturan kursi tidak perlu tahu ada
-- meja yang labelnya bukan angka.
-- ---------------------------------------------------------------------------

alter table public.seat_maps
  add column if not exists table_labels jsonb not null default '{}'::jsonb;

comment on column public.seat_maps.table_labels is
  'Label meja yang menyimpang dari nomor urutnya, bentuk {"posisi": "label"}, contoh {"4": "3A"}. Posisi meja tidak berubah; hanya tulisan yang tampil. Label ikut menyusun label kursi lewat seat_label_pattern, jadi harus sama dengan penulisan di scanner API.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.seat_maps'::regclass
      and conname = 'seat_maps_table_labels_is_object'
  ) then
    alter table public.seat_maps
      add constraint seat_maps_table_labels_is_object
      check (jsonb_typeof(table_labels) = 'object');
  end if;
end $$;
