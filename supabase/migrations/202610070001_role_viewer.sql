-- Peran `viewer`: akun klien yang hanya MELIHAT pendaftar satu acara.
--
-- Satu-satunya layarnya /e/<slug>/live (daftar pendaftar, hitungan, unduhan).
-- Semua route admin memakai requireUser/requireRequestEvent(["admin"]), jadi
-- peran baru ini ditolak di sana tanpa perlu menyentuh route mana pun.
--
-- Hanya menambah nilai enum. Tidak ada baris yang diubah, dan nilai ini tidak
-- dipakai di file yang sama (lihat 202607300001: nilai enum baru tidak boleh
-- dipakai sebelum transaksinya commit).
set lock_timeout = '5s';

alter type user_role add value if not exists 'viewer';

notify pgrst, 'reload schema';
