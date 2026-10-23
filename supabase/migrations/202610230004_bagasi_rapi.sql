-- ============================================================================
-- Bagasi, lanjutan 202610230003 (catatan QA PR #260).
--
--   1. Hak service_role pada luggage_drops ditulis terang, sama dengan tabel
--      lain (train_tickets, checkpoints): jangan bergantung pada default
--      privileges proyek.
--   2. Foto baru disimpan rata per acara:
--        <event_id>/<session_id>-<participant_id>-<uuid>.jpg
--      supaya penghapus foto cukup membaca SATU folder per acara. Bentuk lama
--      (<event_id>/<session_id>/<participant_id>/<uuid>.jpg) tetap diterima
--      untuk baris yang sudah ada.
--   3. Job tally-bagasi-foto kini melihat berkas di bucket, bukan baris tabel:
--      berkas yang tidak lagi ditunjuk baris mana pun (foto lama yang gagal
--      dihapus, peserta/sesi/acara yang dihapus) ikut terhapus 30 hari setelah
--      acaranya, atau segera bila acaranya sudah tidak ada. Janji "foto dihapus
--      30 hari setelah acara" berlaku untuk semua berkas.
--
-- Tidak ada fungsi baru. Satu transaksi, aman dijalankan ulang. Kode PR ini
-- menulis bentuk path baru: jalankan dulu, baru merge (bila kode masuk lebih
-- dulu, unggah foto ditolak constraint lama; jumlah bagasi tetap tersimpan).
-- ============================================================================

begin;
set local lock_timeout = '5s';

grant select, insert, update, delete on table public.luggage_drops to service_role;

alter table public.luggage_drops drop constraint if exists luggage_drops_photo_path_check;
alter table public.luggage_drops add constraint luggage_drops_photo_path_check check (
  photo_path is null
  or photo_path ~ '^[0-9a-f-]{36}/[0-9]+-[0-9a-f-]{36}-[0-9a-f-]{36}\.(jpg|webp)$'
  or photo_path ~ '^[0-9a-f-]{36}/[0-9]+/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|webp)$'
);

select cron.unschedule('tally-bagasi-foto')
 where exists (select 1 from cron.job where jobname = 'tally-bagasi-foto');

-- Berkas di folder acara yang hari terakhirnya lebih dari 30 hari lalu, atau
-- yang acaranya sudah tidak ada. Acara tanpa tanggal tidak disentuh (sama
-- dengan route).
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
        select 1 from storage.objects o
         where o.bucket_id = 'luggage-photos'
           and not exists (
             select 1 from public.events e
              where e.id::text = split_part(o.name, '/', 1)
                and (coalesce(e.end_date, e.event_date) is null
                     or coalesce(e.end_date, e.event_date) >= current_date - 30)
           )
      );
  $job$
);

notify pgrst, 'reload schema';

commit;
