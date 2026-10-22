-- ============================================================================
-- Kapan sebuah checkpoint, dari Agenda (Check-in > Checkpoints > When).
-- Disetujui Hanung 2026-10-22 (KSO: ambil badge, ambil tiket kereta, dan kumpul
-- di Gambir pada hari yang berbeda; tanggal bisa sama atau beda per batch).
--
-- Satu kolom integer[] di checkpoints: id baris Agenda (rundown_items) yang
-- memberi checkpoint itu tanggal dan jam.
--
--   null            tanpa tanggal (bawaan), kartu peserta sama seperti sebelumnya
--   {12}            satu baris untuk semua
--   {12, 13, 14}    satu baris per batch; peserta melihat tanggal dari baris
--                   yang memang untuknya (Agenda > Who sees it, 202610210001)
--
-- Tanggal dan jam tidak disalin ke checkpoint: jam yang diubah di Agenda ikut
-- berubah di checkpoint, sama dengan Trip bus (202610170002).
--
-- Larik, bukan FK, sama dengan blok Rute (agenda_item_ids di landing_config):
-- baris Agenda yang dihapus hanya membuat id-nya diabaikan saat dibaca, dan
-- pembaca hanya mencari id itu di antara baris Agenda acara yang sama, jadi id
-- acara lain tidak pernah tampil. Route admin juga menolak id yang bukan baris
-- Agenda acara ini.
--
-- Hanya menambah satu kolom tanpa default (null) dan satu CHECK bentuk. Tidak
-- ada data yang diubah: setiap acara berubah 0 px. Hak akses tabel yang sudah
-- ada (service_role saja) berlaku untuk kolom baru. Satu transaksi, aman
-- dijalankan ulang.
--
-- Aman sebelum atau sesudah kodenya tayang: kode membaca checkpoints dengan
-- select *, dan menyimpan When sebelum migrasi ini dijawab 409
-- CHECKPOINT_WHEN_NOT_READY.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.checkpoints
  add column if not exists agenda_item_ids integer[];

alter table public.checkpoints drop constraint if exists checkpoints_agenda_item_ids_check;
-- CASE + coalesce(..., false): elemen null membuat `0 < all(...)` bernilai NULL,
-- dan NULL lolos CHECK. Karena itu elemen null diperiksa sendiri dan hasil NULL
-- apa pun dianggap salah.
alter table public.checkpoints
  add constraint checkpoints_agenda_item_ids_check
  check (
    case
      when agenda_item_ids is null then true
      else coalesce(
        array_ndims(agenda_item_ids) = 1
        and cardinality(agenda_item_ids) between 1 and 8
        and array_position(agenda_item_ids, null) is null
        and 0 < all (agenda_item_ids),
        false)
    end
  );

comment on column public.checkpoints.agenda_item_ids is
  'Baris Agenda (rundown_items.id, acara yang sama) yang memberi checkpoint ini tanggal dan jam. Null = tanpa tanggal. 1 sampai 8 id; peserta melihat baris yang boleh ia lihat.';

notify pgrst, 'reload schema';

commit;
