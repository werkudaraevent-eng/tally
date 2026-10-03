-- Email Konfirmasi pendaftaran yang bisa diatur per acara (Pesan peserta >
-- Email otomatis). Aditif: kolom baru di event_settings dan
-- event_registrations, tanpa fungsi, tanpa trigger, tanpa mengubah baris yang
-- ada.
--
-- event_settings.registration_email   templat JSON (lihat
--                         src/lib/email/konfirmasi/templat.ts), termasuk sakelar
--                         email "Tidak disetujui". NULL = templat bawaan dari Tema
--                         acara; acara lama tetap mengirim email tanpa diatur.
-- event_settings.registration_email_pending  sakelar email "Menunggu
--                         persetujuan" (acara bermoderasi, terkirim saat
--                         mendaftar). Bawaan TRUE. Email ber-QR saat disetujui
--                         TIDAK bisa dimatikan: tanpa itu peserta tiba di meja
--                         registrasi tanpa QR.
-- event_registrations.email_claim / email_claimed_until  kunci "Kirim ke
--                         mereka…": satu putaran mengklaim barisnya dulu (cap unik,
--                         berlaku 10 menit) dan hanya mengirim baris yang klaimnya
--                         miliknya, jadi dua tab atau dua panitia yang menekan
--                         bersamaan tidak mengirim tiket dua kali.
begin;

alter table public.event_settings
  add column if not exists registration_email jsonb,
  add column if not exists registration_email_pending boolean not null default true;

alter table public.event_settings
  drop constraint if exists event_settings_registration_email_check,
  add constraint event_settings_registration_email_check
    check (registration_email is null
           or (jsonb_typeof(registration_email) = 'object' and pg_column_size(registration_email) <= 65536));

alter table public.event_registrations
  add column if not exists email_claim text,
  add column if not exists email_claimed_until timestamptz;

commit;
