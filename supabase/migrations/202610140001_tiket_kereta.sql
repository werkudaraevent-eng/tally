-- ============================================================================
-- Tiket kereta peserta (Logistik, tab Trains).
--
-- Satu baris = satu tiket satu peserta untuk satu arah: berangkat
-- ('outbound') atau pulang ('return'). Panitia mengisinya dari Excel (daftar
-- dari agen atau KAI), lalu peserta melihat kartu "Tiket kereta" di
-- Dashboard saya bila "Kamar dan bus" dinyalakan di Area peserta.
--
-- Tabel sendiri, bukan perluasan transport_trips/assignments: bus ditempatkan
-- per kendaraan dengan kapasitas, sedangkan kereta per orang dengan gerbong,
-- kursi, dan kode booking masing-masing, sering di kereta yang berbeda.
--
-- Tanggal dan jam disimpan apa adanya (date + teks HH:MM) karena itu yang
-- tertulis di tiket: jam stasiun setempat, tanpa zona waktu.
--
-- Hanya menambah satu tabel. Akses hanya lewat service role, sama seperti
-- tabel logistik lain. Peserta yang dihapus ikut menghapus tiketnya.
-- ============================================================================

begin;

set local lock_timeout = '5s';

create table if not exists public.train_tickets (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null,
  direction text not null check (direction in ('outbound', 'return')),
  -- Nama dan nomor kereta seperti di tiket: "Argo Lawu 8".
  train_name text not null check (char_length(train_name) between 1 and 80),
  travel_class text check (char_length(travel_class) <= 40),
  origin text check (char_length(origin) <= 80),
  destination text check (char_length(destination) <= 80),
  depart_date date,
  depart_time text check (depart_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  arrive_time text check (arrive_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  carriage text check (char_length(carriage) <= 20),
  seat text check (char_length(seat) <= 20),
  booking_code text check (char_length(booking_code) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete cascade,
  -- Satu tiket per arah per peserta. Impor ulang memperbarui baris yang sama.
  constraint train_tickets_participant_direction_unique unique (event_id, participant_id, direction)
);

alter table public.train_tickets enable row level security;
revoke all on table public.train_tickets from public, anon, authenticated;
grant select, insert, update, delete on table public.train_tickets to service_role;

comment on table public.train_tickets is
  'Tiket kereta per peserta per arah (outbound, return). Service role saja.';

commit;

notify pgrst, 'reload schema';
