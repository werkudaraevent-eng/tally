-- Agenda bawaan untuk layar publik.
--
-- Sebelum ini, `/denah` tanpa parameter selalu jatuh ke agenda dengan
-- `sort_order` terkecil. Akibatnya untuk menampilkan sesi malam, satu-satunya
-- cara adalah menulis `?sesi=gala-malam` di alamat layar. Itu menyulitkan saat
-- acara berlangsung: LED sudah terpasang, dan mengganti alamatnya berarti
-- menyentuh perangkat yang mungkin sulit dijangkau.
--
-- Dengan kolom ini admin bisa memindahkan seluruh layar publik dari sesi pagi ke
-- sesi malam dari satu tempat.
--
-- `on delete set null` dengan sengaja: menghapus agenda tidak boleh mematikan
-- halaman denah. Bila agenda bawaan hilang, halaman kembali memakai agenda
-- terpublikasi pertama, bukan menampilkan layar kosong.
alter table public.seat_maps
  add column if not exists default_session_id int
  references public.seat_map_sessions(id) on delete set null;
