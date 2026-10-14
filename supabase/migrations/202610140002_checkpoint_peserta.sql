-- ============================================================================
-- Checkpoint peserta (Check-in > Checkpoints).
--
-- Daftar langkah berurutan yang dilihat peserta di Dashboard saya: ambil ID
-- card, ambil kaos, titip bagasi, naik bus. Rancangan yang disetujui Hanung
-- 2026-10-14: /mnt/project-files/checkpoint/rekomendasi.md.
--
-- Checkpoint TIDAK punya catatan selesai sendiri. Setiap baris menunjuk tepat
-- satu bukti yang sudah dicatat aplikasi:
--
--   session_id  selesai saat peserta pertama kali dipindai di sesi itu
--               (attendance_scans), mis. "Titip bagasi" di sesi Luggage drop.
--   item_id     selesai saat barang itu diserahkan (item_pickups), mis.
--               "Ambil kaos".
--
-- Jadi tidak ada jalur tulis baru di hari-H dan tidak ada data yang bisa
-- tidak sinkron dengan daftar hadir. Urutan hanya untuk tampilan: petugas
-- tidak menolak peserta yang melompati langkah.
--
-- Dua tabel dan satu fungsi baca. Akses hanya lewat service role, sama seperti
-- tabel kehadiran dan logistik lain. Acara yang tidak menyalakannya tidak
-- berubah: tanpa baris checkpoint_settings, fiturnya mati.
-- ============================================================================

begin;

set local lock_timeout = '5s';

create table if not exists public.checkpoint_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  -- Kartu Checkpoint di Dashboard saya dan catatan checkpoint di layar scan.
  enabled boolean not null default false,
  -- Poin per checkpoint. Mati: kartu hanya menunjukkan kemajuan.
  points_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.checkpoints (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  -- Teks yang dilihat peserta, dalam bahasa utama acara; *_en untuk halaman
  -- peserta berbahasa Inggris (kosong = pakai yang utama).
  title text not null check (char_length(btrim(title)) between 1 and 80),
  title_en text check (char_length(title_en) <= 80),
  place text check (char_length(place) <= 120),
  place_en text check (char_length(place_en) <= 120),
  session_id bigint,
  item_id bigint,
  points int check (points between 0 and 10000),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checkpoints_satu_bukti check ((session_id is null) <> (item_id is null)),
  -- FK komposit: sesi atau barang milik acara lain ditolak database. Sesi atau
  -- barang yang dihapus ikut menghapus checkpoint-nya; sesi yang sudah punya
  -- catatan hadir memang tidak bisa dihapus (route admin menolaknya).
  foreign key (event_id, session_id) references public.attendance_sessions(event_id, id) on delete cascade,
  foreign key (event_id, item_id) references public.pickup_items(event_id, id) on delete cascade
);

create index if not exists checkpoints_event_idx on public.checkpoints (event_id, sort_order, id);

alter table public.checkpoint_settings enable row level security;
alter table public.checkpoints enable row level security;
revoke all on table public.checkpoint_settings from public, anon, authenticated;
revoke all on table public.checkpoints from public, anon, authenticated;
grant select, insert, update, delete on table public.checkpoint_settings to service_role;
grant select, insert, update, delete on table public.checkpoints to service_role;

-- Sequence identitas: hak bawaan anon/authenticated ikut dicabut.
do $$
declare
  urutan text := pg_get_serial_sequence('public.checkpoints', 'id');
begin
  if urutan is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', urutan);
  end if;
end $$;

comment on table public.checkpoint_settings is 'Checkpoint peserta per acara: nyala/mati dan poin. Service role saja.';
comment on table public.checkpoints is 'Checkpoint peserta: satu baris menunjuk satu sesi scan ATAU satu barang. Service role saja.';

-- ---------------------------------------------------------------------------
-- Angka di Check-in > Checkpoints: berapa peserta aktif yang menyelesaikan
-- tiap checkpoint dan berapa yang menyelesaikan semuanya.
--
-- Dihitung di database, bukan di route: attendance_scans bisa puluhan ribu
-- baris di hari-H, dan menariknya ke server melewati batas 1.000 baris
-- PostgREST. Peserta yang dibatalkan (source_removed_at) tidak dihitung.
-- ---------------------------------------------------------------------------
create or replace function public.checkpoint_progress(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cp as (
    select id, session_id, item_id from public.checkpoints where event_id = p_event_id
  ),
  aktif as (
    select id from public.participants where event_id = p_event_id and source_removed_at is null
  ),
  selesai as (
    select c.id as checkpoint_id, s.participant_id
      from cp c
      join public.attendance_scans s on s.event_id = p_event_id and s.session_id = c.session_id
     where c.session_id is not null
    union
    select c.id, ip.participant_id
      from cp c
      join public.item_pickups ip on ip.event_id = p_event_id and ip.item_id = c.item_id
     where c.item_id is not null
  ),
  sah as (
    select s.checkpoint_id, s.participant_id from selesai s join aktif a on a.id = s.participant_id
  )
  select jsonb_build_object(
    'done', coalesce((select jsonb_object_agg(checkpoint_id::text, n) from (select checkpoint_id, count(*) as n from sah group by checkpoint_id) x), '{}'::jsonb),
    'finished_all', case when (select count(*) from cp) = 0 then 0
      else (select count(*) from (select participant_id from sah group by participant_id having count(*) = (select count(*) from cp)) y) end,
    'participants', (select count(*) from aktif)
  );
$$;

revoke all on function public.checkpoint_progress(uuid) from public, anon, authenticated;
grant execute on function public.checkpoint_progress(uuid) to service_role;

commit;

notify pgrst, 'reload schema';
