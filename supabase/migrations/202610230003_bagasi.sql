-- ============================================================================
-- Bagasi di meja checkpoint (Check-in > Sessions > Record luggage).
-- Disetujui Hanung 2026-10-23: panitia KSO ingin petugas di meja titip bagasi
-- mencatat JUMLAH bagasi tiap peserta dan memotretnya.
--
-- Pola yang ditiru: tiket titip koper hotel dan bag drop maskapai. Yang
-- dicatat adalah jumlah (bukti utama, kiriman kecil) dan satu foto semua
-- bagasinya (bukti pendukung). Peserta melihat catatannya sendiri di portal,
-- supaya jumlah yang salah ketahuan di meja, bukan saat koper hilang.
--
--   attendance_sessions.records_luggage   saklar per sesi, bawaan MATI: sesi
--                                         lain dan acara lain berubah 0 px.
--   luggage_drops                         satu baris per peserta per sesi.
--   bucket luggage-photos                 PRIVAT. Dibuka hanya lewat signed URL
--                                         berumur pendek yang dibuat server
--                                         (admin dan scanner acara itu, plus
--                                         peserta untuk fotonya sendiri).
--   job tally-bagasi-foto                 tiap hari memanggil /api/cron/bagasi-foto
--                                         bila ada foto dari acara yang selesai
--                                         lebih dari 30 hari lalu. Jumlahnya
--                                         tetap disimpan, fotonya dihapus.
--
-- Tidak ada fungsi baru: route handler menulis lewat service role, sama seperti
-- tabel lain. Satu transaksi, aman dijalankan ulang. Kode PR ini membaca kolom
-- dan tabel baru: jalankan dulu, baru merge.
-- ============================================================================

begin;
set local lock_timeout = '5s';

alter table public.attendance_sessions
  add column if not exists records_luggage boolean not null default false;

comment on column public.attendance_sessions.records_luggage is
  'Petugas mencatat jumlah bagasi dan satu foto setelah memindai di sesi ini.';

create table if not exists public.luggage_drops (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  session_id bigint not null,
  participant_id uuid not null,
  -- Nol = peserta datang ke meja tanpa bagasi (tombol "No luggage"), dan itu
  -- jawaban yang disengaja, bukan baris kosong.
  bag_count int not null check (bag_count between 0 and 30),
  -- Path di bucket privat, BUKAN URL. Bentuknya dibuat server:
  -- <event_id>/<session_id>/<participant_id>/<uuid>.jpg
  photo_path text check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[0-9]+/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|webp)$'),
  recorded_at timestamptz not null default now(),
  -- `set null`: menghapus akun panitia tidak boleh menghapus catatan bagasi.
  recorded_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  constraint luggage_drops_unique unique (session_id, participant_id),
  -- FK komposit: sesi atau peserta milik acara lain ditolak database.
  foreign key (event_id, session_id) references public.attendance_sessions(event_id, id) on delete cascade,
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete cascade
);

create index if not exists luggage_drops_participant_idx on public.luggage_drops (event_id, participant_id);
create index if not exists luggage_drops_photo_idx on public.luggage_drops (event_id) where photo_path is not null;

alter table public.luggage_drops enable row level security;
revoke all on table public.luggage_drops from public, anon, authenticated;

-- Bucket privat. Batas 2 MB: ponsel petugas mengecilkan foto ke sekitar
-- 200 KB sebelum mengirim, jadi berkas sebesar ini bukan dari layar pemindai.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('luggage-photos', 'luggage-photos', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Penghapus foto. Rahasia Vault yang sama dengan tally-pesan dan tally-domain
-- (docs/ops/cron.md); selama belum ada, job berjalan tanpa memanggil apa pun.
-- Jam 19.23 UTC = 02.23 WIB, jauh dari jam acara.
create extension if not exists pg_net;

select cron.unschedule('tally-bagasi-foto')
 where exists (select 1 from cron.job where jobname = 'tally-bagasi-foto');

select cron.schedule(
  'tally-bagasi-foto',
  '23 19 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'tally_site_url' limit 1) || '/api/cron/bagasi-foto',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tally_cron_secret' limit 1),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'tally_site_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'tally_cron_secret')
      and exists (
        select 1 from public.luggage_drops d
          join public.events e on e.id = d.event_id
         where d.photo_path is not null
           and coalesce(e.end_date, e.event_date) < current_date - 30
      );
  $job$
);

notify pgrst, 'reload schema';

commit;
