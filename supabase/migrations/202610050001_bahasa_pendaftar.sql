-- Bahasa formulir pendaftaran per pendaftar, untuk email Konfirmasi dalam
-- bahasa Inggris. Aditif: satu kolom, tanpa fungsi, tanpa trigger, tanpa
-- mengubah baris yang ada.
--
-- event_registrations.language  'id' | 'en'. Diisi /api/registrasi tepat
--                         setelah submit_event_registration: bahasa formulir
--                         yang dipakai ('en' hanya bila halaman English acara
--                         aktif saat dikirim), selain itu bahasa utama acara.
--                         NULL = Indonesia, SELALU (pendaftar sebelum kolom ini
--                         ada). Sengaja bukan "bahasa utama acara": mengganti
--                         bahasa utama tidak boleh diam-diam mengubah email
--                         kirim ulang pendaftar lama.
begin;
set local lock_timeout = '5s';

alter table public.event_registrations
  add column if not exists language text;

alter table public.event_registrations
  drop constraint if exists event_registrations_language_check,
  add constraint event_registrations_language_check
    check (language is null or language in ('id', 'en'));

-- PostgREST memuat ulang skema: tanpa ini PATCH kolom baru gagal PGRST204.
notify pgrst, 'reload schema';

commit;
