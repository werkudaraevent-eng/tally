-- Toggle nominal di Live Display.
--
-- Permintaan klien: top spender diumumkan TANPA menampilkan nominal belanja.
-- Peringkat tetap tampil, angkanya tidak.
--
-- Kenapa boolean di display_settings, bukan mode dengan beberapa nilai:
-- pertanyaannya biner ("angkanya dipajang atau tidak"), dan tempat ini sudah
-- menampung tiga saudaranya (show_company, show_booth_progress, show_ticker)
-- yang bentuk dan cara pakainya sama persis. Menaruhnya di tabel lain berarti
-- satu fetch tambahan di jalur yang sama untuk satu boolean.
--
-- Default true supaya menjalankan migration ini TIDAK mengubah apa pun yang
-- sedang tampil. Layar yang berubah sendiri setelah deploy adalah hal terakhir
-- yang boleh terjadi pada hari acara.
--
-- CATATAN PENTING soal penegakan, ada di /api/display/reveal:
-- nilai false membuat `total_spent` DIHAPUS dari response publik, bukan hanya
-- disembunyikan lewat CSS. Endpoint itu terbuka tanpa login, jadi menyembunyikan
-- di layar saja berarti nominal belanja tiap eksekutif tetap terbaca siapa pun
-- yang membuka /display lalu melihat tab Network — tepat angka yang diminta
-- untuk tidak ditampilkan. Alasan yang sama dengan reveal bertahap, yang juga
-- memotong papan di server, bukan di browser.
alter table public.display_settings
  add column if not exists show_amount boolean not null default true;

comment on column public.display_settings.show_amount is
  'false = nominal top spender tidak dipajang. Ditegakkan dengan MENGHAPUS total_spent dari response /api/display/reveal (endpoint publik), bukan sekadar disembunyikan di layar. Peringkat tetap benar karena urutannya dihitung get_leaderboard di server.';
