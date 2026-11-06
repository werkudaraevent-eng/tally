-- ---------------------------------------------------------------------------
-- Undian: musik di layar panggung (Lucky draw > Stage display > Music).
--
-- music_enabled      = saklar per event, BAWAAN MATI: event yang sudah ada
--                      tidak berubah sama sekali.
-- music_waiting_url  = lagu berulang di layar tunggu.
-- music_drawing_url  = lagu berulang sejak Draw ditekan sampai nama tampil.
-- music_winner_url   = lagu sekali saat nama pemenang tampil.
-- music_volume       = 0-100, volume pemutar di layar panggung.
--
-- Berkasnya di bucket public-read baru `undian-music`, satu folder per event.
-- Server hanya menerima URL dari folder event itu sendiri
-- (src/lib/undian-musik.ts); CHECK di sini hanya pagar kasar.
-- Unggahan lewat signed upload URL yang dibuat server dengan service role,
-- jadi tidak perlu policy storage untuk anon/authenticated.
--
-- Satu transaksi, aman dijalankan ulang. Kode aman sebelum migrasi ini: layar
-- panggung dan CMS membaca tanpa kolom musik bila kolomnya belum ada.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

alter table public.undian_settings
  add column if not exists music_enabled boolean not null default false,
  add column if not exists music_waiting_url text,
  add column if not exists music_drawing_url text,
  add column if not exists music_winner_url text,
  add column if not exists music_volume smallint not null default 80;

alter table public.undian_settings drop constraint if exists undian_settings_music_url_check;
alter table public.undian_settings
  add constraint undian_settings_music_url_check check (
    (music_waiting_url is null or (music_waiting_url ~ '^https://' and char_length(music_waiting_url) <= 1000))
    and (music_drawing_url is null or (music_drawing_url ~ '^https://' and char_length(music_drawing_url) <= 1000))
    and (music_winner_url is null or (music_winner_url ~ '^https://' and char_length(music_winner_url) <= 1000))
  );

alter table public.undian_settings drop constraint if exists undian_settings_music_volume_check;
alter table public.undian_settings
  add constraint undian_settings_music_volume_check check (music_volume between 0 and 100);

comment on column public.undian_settings.music_enabled is
  'Musik di layar panggung undian. Bawaan mati.';
comment on column public.undian_settings.music_waiting_url is
  'Lagu berulang di layar tunggu: URL publik di undian-music/<event_id>/. Null = hening.';
comment on column public.undian_settings.music_drawing_url is
  'Lagu berulang sejak Draw sampai nama tampil. Null = hening.';
comment on column public.undian_settings.music_winner_url is
  'Lagu sekali saat nama pemenang tampil; menggantikan chime. Null = chime (bila Sound menyala).';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('undian-music', 'undian-music', true, 15728640,
        array['audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/wave'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;

notify pgrst, 'reload schema';
