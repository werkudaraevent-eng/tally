-- Email Konfirmasi pendaftaran yang bisa diatur per acara (Pesan peserta >
-- Email otomatis). Aditif: dua kolom baru di event_settings, tanpa fungsi,
-- tanpa trigger, tanpa mengubah baris yang ada.
--
-- registration_email      templat JSON (lihat src/lib/email/konfirmasi/templat.ts).
--                         NULL = templat bawaan dari Tema acara; acara lama tetap
--                         mengirim email tanpa perlu diatur.
-- registration_email_pending  sakelar email "Menunggu persetujuan" (acara
--                         bermoderasi, terkirim saat mendaftar). Bawaan TRUE.
--                         Email ber-QR saat disetujui TIDAK bisa dimatikan:
--                         tanpa itu peserta tiba di meja registrasi tanpa QR.
alter table public.event_settings
  add column if not exists registration_email jsonb,
  add column if not exists registration_email_pending boolean not null default true;

alter table public.event_settings
  drop constraint if exists event_settings_registration_email_check,
  add constraint event_settings_registration_email_check
    check (registration_email is null
           or (jsonb_typeof(registration_email) = 'object' and pg_column_size(registration_email) <= 65536));
