-- ---------------------------------------------------------------------------
-- Email dibuka dan diklik (Messages): laporan Opened / Clicked.
--
-- Per acara, default MATI (event_settings.email_tracking). Bila menyala:
--   * setiap email membawa gambar 1x1 milik Tally (/api/jejak/buka/<token>).
--     Pembukaan oleh proxy Apple Mail (Mail Privacy Protection memuat semua
--     gambar sendiri) dicatat terpisah di opened_auto_at, bukan opened_at.
--   * salinan email pengumuman membawa tautan pribadi ke halaman baca
--     pengumuman itu (/e/<slug>/peserta/kabar?t=<token>), tanpa masuk portal:
--     isinya sama dengan email itu sendiri. Klik dicatat setelah halaman
--     benar-benar berjalan di peramban (pemindai tautan kantor tidak dihitung).
--
-- Yang disimpan hanya waktu. Tidak ada IP, user agent atau lokasi.
--
-- Token tidak disimpan: tanda tangan HMAC atas id baris (SESSION_SECRET).
-- Hanya dibaca dan ditulis server (service role), seperti tabel Pesan lain.
-- ---------------------------------------------------------------------------

begin;
set local lock_timeout = '5s';

alter table public.event_settings
  add column if not exists email_tracking boolean not null default false;

comment on column public.event_settings.email_tracking is
  'Messages: catat email dibuka (gambar 1x1) dan diklik. Default mati.';

alter table public.message_blast_recipients
  add column if not exists opened_at      timestamptz,
  add column if not exists opened_auto_at timestamptz,
  add column if not exists clicked_at     timestamptz;

comment on column public.message_blast_recipients.opened_at is
  'Pertama dibuka (gambar 1x1 dimuat), bukan oleh proxy Apple Mail.';
comment on column public.message_blast_recipients.opened_auto_at is
  'Gambar 1x1 dimuat oleh proxy Apple Mail Privacy Protection: belum tentu dibaca.';

-- FK komposit (event_id, id) seperti tabel acara lain: baris penerima tidak
-- bisa menunjuk pengumuman atau peserta acara lain. Tabel pengumuman kecil
-- (puluhan baris per acara), jadi kunci unik ini cepat dibuat.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_announcements_event_id_id_key') then
    alter table public.event_announcements add constraint event_announcements_event_id_id_key unique (event_id, id);
  end if;
end $$;

create table if not exists public.announcement_email_recipients (
  id               bigint generated always as identity primary key,
  event_id         uuid not null references public.events(id) on delete cascade,
  announcement_id  uuid not null,
  participant_id   uuid,
  address          text not null check (char_length(address) between 3 and 254),
  -- published_at pengumuman saat email ini dikirim: klik dihitung Seen hanya
  -- untuk terbitan itu, sama seperti Notify again memulai hitungan lagi.
  published_at     timestamptz not null,
  provider_id      text,
  sent_at          timestamptz not null default now(),
  opened_at        timestamptz,
  opened_auto_at   timestamptz,
  clicked_at       timestamptz,
  constraint announcement_email_recipients_announcement_fkey
    foreign key (event_id, announcement_id) references public.event_announcements(event_id, id) on delete cascade,
  -- set null (participant_id): set null biasa pada FK komposit ikut
  -- mengosongkan event_id, yang not null.
  constraint announcement_email_recipients_participant_fkey
    foreign key (event_id, participant_id) references public.participants(event_id, id) on delete set null (participant_id)
);

create index if not exists announcement_email_recipients_ann_idx
  on public.announcement_email_recipients (announcement_id, sent_at);
create index if not exists announcement_email_recipients_event_idx
  on public.announcement_email_recipients (event_id);

alter table public.announcement_email_recipients enable row level security;
revoke all on table public.announcement_email_recipients from public, anon, authenticated;

comment on table public.announcement_email_recipients is
  'Salinan email pengumuman per penerima: dibuka (gambar 1x1) dan diklik (halaman baca). Hanya bila event_settings.email_tracking menyala.';

commit;

notify pgrst, 'reload schema';
