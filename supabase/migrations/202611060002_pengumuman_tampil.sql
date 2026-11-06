-- ---------------------------------------------------------------------------
-- Pengumuman: sembunyikan tanpa menghapus (Messages > Announcements > Hide)
-- dan tampil sebagai pop-up yang harus ditutup peserta (Show as pop-up).
--
-- hidden_at = kapan panitia menyembunyikannya. Null = tampil seperti biasa.
--             Selama terisi, pengumuman tidak tampil di lonceng maupun
--             Dashboard saya, dan tidak bisa dikirim ulang atau dikirim lewat
--             email. Show mengosongkannya lagi; published_at tidak berubah,
--             jadi menampilkan kembali TIDAK menyalakan lonceng.
-- popup     = true: terbuka sebagai dialog di atas area peserta sampai peserta
--             menutupnya. Ditutup dicatat per perangkat (localStorage) per
--             id + published_at, jadi Notify again memunculkannya lagi.
--             Default false: pengumuman lama tetap tanpa pop-up.
--
-- hidden_at nullable tanpa default, popup default false: pengumuman yang sudah ada tetap tampil,
-- peserta melihat 0 perubahan. Satu transaksi, aman dijalankan ulang. Kode aman
-- sebelum migrasi ini (membaca tanpa kedua kolom, Hide dan Show as pop-up
-- belum tampil).
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

alter table public.event_announcements
  add column if not exists hidden_at timestamptz,
  add column if not exists popup boolean not null default false;

comment on column public.event_announcements.hidden_at is
  'Kapan panitia menyembunyikan pengumuman ini dari peserta. Null = tampil.';
comment on column public.event_announcements.popup is
  'true = terbuka sebagai pop-up di area peserta sampai ditutup (sekali per perangkat per terbit/kirim ulang).';

commit;

notify pgrst, 'reload schema';
