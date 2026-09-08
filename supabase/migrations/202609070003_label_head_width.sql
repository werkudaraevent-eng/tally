-- ---------------------------------------------------------------------------
-- Lebar kepala cetak, dipisahkan dari lebar label.
--
-- ---- Masalah yang diperbaiki ----------------------------------------------
--
-- Layar setelan label meminta panitia mengisi lebar dan tinggi dalam PIKSEL.
-- Yang dipegang panitia adalah gulungan bertuliskan "50 x 30 mm". Tidak ada
-- jalan dari yang satu ke yang lain tanpa mengetahui dpi printer dan tanpa tahu
-- bahwa kepala cetak sebagian model lebih sempit daripada labelnya. Hasilnya
-- persis yang dilaporkan: layar yang tidak dipahami sama sekali.
--
-- ---- Kenapa piksel tidak bisa sekadar dihitung dari milimeter --------------
--
-- 50 mm pada 203 dpi adalah 400 px di atas kertas, tetapi kepala cetak B1
-- hanya selebar 384 px terukur. Kolom di luar kepala dibuang printer tanpa satu
-- pun pesan galat, dan yang terlihat cuma tepi kanan yang hilang. Jadi lebar
-- cetak adalah nilai terkecil di antara "selebar apa labelnya" dan "selebar apa
-- kepala cetaknya" -- dua besaran yang selama ini tertumpuk di satu kolom.
--
-- Dipisah, keduanya bisa ditanyakan dengan cara yang benar: ukuran label
-- dipilih panitia dari daftar gulungan yang mereka beli, dan lebar kepala cetak
-- adalah sifat printer yang dijawab printernya sendiri lewat probe 0xDC[03] di
-- layar pemindai.
--
-- 384 sebagai bawaan adalah angka B1 yang terukur, bukan tebakan yang dibulatkan.
-- ---------------------------------------------------------------------------

alter table public.label_settings
  add column if not exists head_px int not null default 384 check (head_px between 32 and 1200);

comment on column public.label_settings.head_px is
  'Lebar kepala cetak printer dalam piksel. Lebar cetak = min(lebar label, nilai ini).';
