-- ============================================================================
-- Buang FK single-column yang menjadi GANDA setelah FK komposit ditambahkan.
--
-- REGRESI DARI TAHAP 2 (202608070002): FK komposit ditambahkan tetapi FK lama
-- dibiarkan, sehingga ada DUA relasi antara pasangan tabel yang sama. PostgREST
-- tidak dapat memilih relasi mana yang dipakai untuk embedded select
-- (`participants(...)`, `order_special_items(...)`) dan membalas 500.
--
-- DIUKUR: `/api/admin/orders` -> 500 INTERNAL_ERROR, sementara 8 endpoint admin
-- lain yang TIDAK memakai embedded select tetap 200. Halaman Orders adalah
-- halaman yang paling sering dibuka admin.
--
-- Sesudah perbaikan (diuji lewat browser dengan sesi admin sungguhan):
--   /api/admin/orders?limit=5            -> 200, relasi peserta terisi, item spesial terbaca
--   /api/admin/orders?status=handed_over -> 200, 222 dari 225 (filter jalan)
--   ringkasan uang                       -> Rp 69.365.271 (dihitung server, seluruh hasil filter)
--
-- Pola kegagalan yang SAMA untuk keempat kalinya di fitur ini: typecheck hijau,
-- lint hijau, build hijau, GET lain sehat -- yang rusak hanya terlihat saat
-- halamannya benar-benar dibuka. Verifikasi lewat perubahan skema saja tidak cukup.
--
-- Aman dibuang: FK komposit sudah menjamin hal yang sama PLUS keterikatan event.
-- `(event_id, participant_id) -> participants(event_id, id)` mustahil terpenuhi
-- oleh participant_id yang tidak ada, karena `participants` punya
-- `unique (event_id, id)` dan `orders.event_id` NOT NULL.
--
-- FK ganda ke `users` (created_by / paid_by / voided_by / handed_over_by) TIDAK
-- disentuh: kolomnya berbeda-beda sehingga PostgREST dapat membedakannya lewat
-- nama kolom, dan itu sudah begitu sejak sebelum multi-event.
-- ============================================================================

alter table public.orders drop constraint if exists orders_participant_id_fkey;
alter table public.orders drop constraint if exists orders_booth_id_fkey;
alter table public.order_special_items drop constraint if exists order_special_items_offer_id_fkey;
alter table public.special_offers drop constraint if exists special_offers_booth_id_fkey;
alter table public.undian_prizes drop constraint if exists undian_prizes_entry_group_id_fkey;

-- Beri tahu PostgREST agar cache skemanya dimuat ulang; tanpa ini relasi lama
-- masih dianggap ada sampai layanannya restart sendiri.
notify pgrst, 'reload schema';
