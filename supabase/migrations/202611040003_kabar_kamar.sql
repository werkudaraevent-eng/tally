-- ============================================================================
-- Kabar kamar (Logistics > Assignments > Email room numbers).
--
-- room_notices: satu baris per peserta, isinya kamar yang TERAKHIR dikabarkan
-- lewat email. `sent_key` = daftar "hotel_id:nomor kamar" stay peserta itu
-- yang sudah bernomor, diurutkan dan digabung (disusun aplikasi,
-- src/lib/logistik/kabar-kamar.ts). Peserta "perlu dikabari" bila kuncinya
-- sekarang tidak kosong dan berbeda dari `sent_key`: nomor kamar baru, atau
-- nomor yang berganti. Label kamar tanpa nomor tidak ikut.
--
-- Hanya dibaca dan ditulis server (service role). Tidak ada fungsi, tidak
-- ada pemicu, tidak menyentuh tabel kamar. Tabel baru saja: aman dijalankan
-- ulang. Kode yang memakainya aman sebelum ini dijalankan (banner tidak
-- tampil) dan merge SETELAH ini dijalankan.
-- ============================================================================

begin;
set local lock_timeout = '5s';

create table if not exists public.room_notices (
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null,
  sent_key text not null,
  sent_to text not null,
  sent_at timestamptz not null default now(),
  sent_by uuid references public.users(id) on delete set null,
  primary key (event_id, participant_id),
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete cascade,
  constraint room_notices_sent_key_check check (char_length(sent_key) between 1 and 2000),
  constraint room_notices_sent_to_check check (char_length(sent_to) between 3 and 320)
);

comment on table public.room_notices is
  'Kamar terakhir yang dikabarkan ke peserta lewat email (Logistics > Email room numbers). sent_key = "hotel_id:nomor" stay bernomor, urut, dipisah "|".';

alter table public.room_notices enable row level security;
revoke all on table public.room_notices from public, anon, authenticated;
grant select, insert, update, delete on table public.room_notices to service_role;

commit;

notify pgrst, 'reload schema';
