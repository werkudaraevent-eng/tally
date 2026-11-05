-- ============================================================================
-- Tiket perjalanan: kereta, pesawat, atau kapal (Logistics > Tickets),
-- diminta Hanung 2026-11-05 ("kedepannya jika ada pesawat gimana?").
--
--   train_tickets.mode     'train' (bawaan) | 'flight' | 'ship'. Satu tabel
--                          untuk semua tiket: isiannya sama (nama dan nomor,
--                          kelas, dari, ke, tanggal, jam, kursi, kode booking).
--                          Gerbong hanya dipakai kereta.
--   train_tickets.segment  1 (bawaan) sampai 6: urutan tiket dalam satu arah,
--                          untuk transit (Medan - Jakarta lalu Jakarta -
--                          Yogyakarta = segmen 1 dan 2 berangkat).
--
-- Kunci unik lama (event, peserta, arah) diganti (event, peserta, arah,
-- segmen). Tiket yang sudah ada menjadi kereta segmen 1, jadi isinya dan
-- tampilannya tidak berubah, dan impor ulang tetap memperbarui baris yang sama.
-- Nama tabel tetap train_tickets supaya kode lain dan hak akses tidak berubah.
--
-- Satu transaksi, aman dijalankan ulang. Jalankan SEBELUM kodenya tayang:
-- admin dan Area peserta membaca kolom mode dan segment.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.train_tickets
  add column if not exists mode text not null default 'train';

alter table public.train_tickets drop constraint if exists train_tickets_mode_check;
alter table public.train_tickets
  add constraint train_tickets_mode_check check (mode in ('train', 'flight', 'ship'));

alter table public.train_tickets
  add column if not exists segment smallint not null default 1;

alter table public.train_tickets drop constraint if exists train_tickets_segment_check;
alter table public.train_tickets
  add constraint train_tickets_segment_check check (segment between 1 and 6);

alter table public.train_tickets drop constraint if exists train_tickets_participant_direction_unique;
alter table public.train_tickets drop constraint if exists train_tickets_participant_direction_segment_unique;
alter table public.train_tickets
  add constraint train_tickets_participant_direction_segment_unique
  unique (event_id, participant_id, direction, segment);

comment on column public.train_tickets.mode is
  'train | flight | ship. Gerbong (carriage) hanya untuk kereta.';
comment on column public.train_tickets.segment is
  'Urutan tiket dalam satu arah (transit), 1 sampai 6.';
comment on table public.train_tickets is
  'Tiket perjalanan (kereta, pesawat, kapal) per peserta per arah per segmen. Service role saja.';

commit;

notify pgrst, 'reload schema';
