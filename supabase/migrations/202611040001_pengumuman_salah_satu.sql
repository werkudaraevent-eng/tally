-- ---------------------------------------------------------------------------
-- Pengumuman: Match All conditions / Any condition (Messages > Announcements >
-- Send to > Participants who match).
--
-- audience_any = true: peserta melihat pengumuman bila SALAH SATU syarat
-- cocok, bukan semua. Hanya untuk audience syarat dengan dua syarat atau
-- lebih (satu syarat: semua dan salah satu sama saja). Datar, tanpa grup
-- bersarang, seperti "match any/all" di Mailchimp dan syarat Lucky draw.
--
-- Pengumuman yang sudah ada mendapat false (semua syarat harus cocok, seperti
-- sekarang): peserta melihat 0 perubahan. Satu transaksi, aman dijalankan
-- ulang. Kode aman sebelum migrasi ini (membaca tanpa kolom baru, pilihan Any
-- condition belum tampil).
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

alter table public.event_announcements
  add column if not exists audience_any boolean not null default false;

alter table public.event_announcements
  drop constraint if exists event_announcements_audience_any_check;

alter table public.event_announcements
  add constraint event_announcements_audience_any_check check (
    case
      when audience_any then
        audience = 'syarat'
        and jsonb_typeof(audience_rules) = 'array'
        and jsonb_array_length(audience_rules) >= 2
      else true
    end
  );

comment on column public.event_announcements.audience_any is
  'Untuk audience syarat dengan 2+ syarat: true = salah satu syarat cukup (Match: Any condition), false = semua syarat harus cocok.';

commit;

notify pgrst, 'reload schema';
