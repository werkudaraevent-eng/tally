-- ============================================================================
-- Tujuan poin checkpoint (Check-in > Checkpoints > Points goal). Temuan E-08
-- audit area peserta KSO, disetujui Hanung 2026-10-17.
--
-- Bila poin checkpoint ditukar dengan sesuatu, kartu checkpoint peserta menulis
-- satu baris di bawah bilah kemajuan:
--
--   belum tercapai  "20 poin lagi untuk masuk undian malam puncak."
--   sudah tercapai  "Poin sudah cukup untuk masuk undian malam puncak."
--
-- Baris itu tidak tampil bila Points mati, bila tujuannya belum diisi, atau
-- bila tujuannya lebih besar dari jumlah poin semua checkpoint (tidak bisa
-- dicapai; admin diberi peringatan).
--
--   points_goal       poin yang dituju, 1..1.000.000.
--   points_reward     untuk apa poinnya, dalam bahasa Indonesia seperti teks
--                     dasar acara lain. Melanjutkan "... poin lagi untuk":
--                     mis. "masuk undian malam puncak".
--   points_reward_en  sama untuk halaman peserta berbahasa Inggris, melanjutkan
--                     "... more points to". Kosong: kalimatnya tampil utuh
--                     dalam bahasa Indonesia, tidak dicampur.
--
-- Tujuan dan "untuk apa" selalu diisi atau dikosongkan bersama: angka tanpa
-- gunanya justru yang dihapus E-08.
--
-- Hanya menambah tiga kolom tanpa default dan empat CHECK pada tabel kecil
-- (satu baris per acara). Tidak ada data yang diubah: setiap acara mendapat
-- tiga kolom kosong, jadi kartunya tidak berubah. Hak akses tabel dari
-- 202610140002 (service role saja) berlaku juga untuk kolom baru, jadi tidak
-- ada grant baru. Satu transaksi: bila satu langkah gagal (mis. lock_timeout),
-- tidak ada yang berubah, dan berkas ini aman dijalankan ulang.
--
-- Aman sebelum atau sesudah kodenya tayang. Kode membaca setelan dengan
-- select *, jadi kolom yang belum ada berarti "tanpa tujuan", dan menyimpan
-- tujuan sebelum migrasi ini dijawab 409 CHECKPOINT_GOAL_NOT_READY.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.checkpoint_settings
  add column if not exists points_goal integer,
  add column if not exists points_reward text,
  add column if not exists points_reward_en text;

alter table public.checkpoint_settings drop constraint if exists checkpoint_settings_points_goal_check;
alter table public.checkpoint_settings
  add constraint checkpoint_settings_points_goal_check
  check (points_goal is null or points_goal between 1 and 1000000);

alter table public.checkpoint_settings drop constraint if exists checkpoint_settings_points_reward_check;
alter table public.checkpoint_settings
  add constraint checkpoint_settings_points_reward_check
  check (points_reward is null or char_length(btrim(points_reward)) between 1 and 60);

alter table public.checkpoint_settings drop constraint if exists checkpoint_settings_points_reward_en_check;
alter table public.checkpoint_settings
  add constraint checkpoint_settings_points_reward_en_check
  check (points_reward_en is null or char_length(btrim(points_reward_en)) between 1 and 60);

-- Berpasangan: tujuan dan "untuk apa" diisi atau dikosongkan bersama, dan
-- versi English hanya ada bila versi utamanya ada.
alter table public.checkpoint_settings drop constraint if exists checkpoint_settings_tujuan_poin_check;
alter table public.checkpoint_settings
  add constraint checkpoint_settings_tujuan_poin_check
  check ((points_goal is null) = (points_reward is null) and (points_reward_en is null or points_reward is not null));

comment on table public.checkpoint_settings is
  'Checkpoint peserta per acara: nyala/mati, poin, dan tujuan poin. Service role saja.';
comment on column public.checkpoint_settings.points_goal is
  'Tujuan poin (E-08), 1..1.000.000. Kosong: kartu tanpa baris tujuan. Berpasangan dengan points_reward.';
comment on column public.checkpoint_settings.points_reward is
  'Untuk apa poinnya, bahasa Indonesia, melanjutkan "... poin lagi untuk": mis. "masuk undian malam puncak".';
comment on column public.checkpoint_settings.points_reward_en is
  'Sama untuk halaman peserta English, melanjutkan "... more points to". Kosong: kalimat tampil utuh dalam bahasa Indonesia.';

notify pgrst, 'reload schema';

commit;
