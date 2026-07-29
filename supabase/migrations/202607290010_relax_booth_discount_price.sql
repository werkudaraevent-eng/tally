-- Longgarkan CHECK harga item diskon booth.
--
-- `booths_discount_item_price_check CHECK (discount_item_price = 1)` adalah
-- peninggalan BR-03 versi lama ("item diskon harganya SELALU Rp 1").
--
-- BR-03 kini menyatakan harga diatur per penawaran di special_offers.price.
-- Constraint ini membuat halaman Item spesial gagal menyimpan begitu admin
-- mengubah harga penawaran bawaan booth di atas Rp 1: API menyalin nilainya balik
-- ke kolom booths untuk menjaga kedua halaman selaras, dan penyalinan itu ditolak.
--
-- Sumber kebenaran harga tetap special_offers.price; kolom di booths hanya cermin
-- untuk kompatibilitas halaman Booth & item.
alter table public.booths drop constraint if exists booths_discount_item_price_check;

alter table public.booths
  add constraint booths_discount_item_price_check check (discount_item_price >= 0);
