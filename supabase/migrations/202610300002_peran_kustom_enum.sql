-- ============================================================================
-- Peran kustom, langkah 1 dari 2: nilai enum `custom`.
--
-- Akun berperan `custom` memakai izin per modul dari access_roles (langkah 2).
-- Dipisah dari langkah 2 karena nilai enum baru belum boleh dipakai di
-- transaksi yang menambahkannya, dan langkah 2 memakainya di CHECK.
-- Aman dijalankan ulang.
-- ============================================================================
set lock_timeout = '5s';

alter type user_role add value if not exists 'custom';

notify pgrst, 'reload schema';
