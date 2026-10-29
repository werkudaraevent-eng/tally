-- ============================================================================
-- Cara mengambil hadiah undian (Lucky draw > Prizes & rules > prize > How
-- winners collect it). Diminta Hanung 2026-10-29: pemenang yang sudah
-- dikonfirmasi melihat hadiahnya di Beranda portal peserta, lengkap dengan
-- cara mengambilnya. Hadiah besar sering diambil di tempat lain (meja hadiah,
-- kantor sponsor), jadi catatannya per hadiah.
--
-- Satu kolom teks di undian_prizes, tanpa default (null):
--
--   claim_note   tampil di kartu "Hadiah kamu" portal pemenang. Kosong = catatan
--                bawaan di Participant area > Lucky draw prize, atau tanpa
--                catatan bila itu juga kosong.
--
-- Teks biasa, dirender sebagai teks (bukan HTML). Panjang 1..400 karakter
-- sesudah trim, sama dengan description.
--
-- Hanya menambah satu kolom dan satu CHECK bentuk. Tidak ada data yang diubah:
-- setiap acara berubah 0 px. Hak akses tabel yang sudah ada (service_role saja)
-- berlaku untuk kolom baru. Duplikat acara ikut menyalinnya (duplicate_event
-- menyalin baris lewat to_jsonb). Satu transaksi, aman dijalankan ulang.
--
-- Jalankan SEBELUM kodenya tayang: daftar kolom hadiah menyebut claim_note.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.undian_prizes
  add column if not exists claim_note text;

alter table public.undian_prizes drop constraint if exists undian_prizes_claim_note_check;
alter table public.undian_prizes
  add constraint undian_prizes_claim_note_check
  check (claim_note is null or char_length(btrim(claim_note)) between 1 and 400);

comment on column public.undian_prizes.claim_note is
  'Cara pemenang mengambil hadiah, tampil di kartu Hadiah kamu di portal peserta. Null = catatan bawaan Participant area.';

commit;

notify pgrst, 'reload schema';
