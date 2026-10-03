-- ---------------------------------------------------------------------------
-- Pengumuman panitia untuk area peserta.
--
-- Panitia menulis pengumuman di admin (menu Pengumuman). Peserta yang sudah
-- masuk melihatnya di lonceng bilah atas halaman acara dan di Dashboard saya.
-- Rujukan polanya: Luma "Blast" (tampil di halaman acara untuk tamu yang
-- login), Whova Announcements (aplikasi + email sekaligus).
--
-- Penerima:
--   semua      = semua akun area peserta acara ini, termasuk yang pendaftarannya
--                belum disetujui (mis. "Pendaftaran ditutup besok")
--   disetujui  = hanya akun yang sudah tertaut ke peserta (participant_id terisi)
--
-- "Belum dibaca" dihitung per akun dengan satu cap waktu, bukan per pesan:
-- pengumuman yang terbit setelah `announcements_seen_at` belum dibaca. Membuka
-- lonceng atau Dashboard saya memperbarui cap waktu itu.
--
-- Hanya dibaca dan ditulis server (service role), seperti tabel area peserta
-- lainnya; tidak ada akses langsung dari anon/authenticated.
-- ---------------------------------------------------------------------------

create table if not exists public.event_announcements (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 120),
  body          text not null default '' check (char_length(body) <= 2000),
  link_url      text check (link_url is null or link_url ~* '^https?://'),
  link_label    text check (link_label is null or char_length(link_label) <= 60),
  audience      text not null default 'semua' check (audience in ('semua', 'disetujui')),
  pinned        boolean not null default false,
  published_at  timestamptz not null default now(),
  -- Ringkasan salinan email terakhir: { "terkirim": n, "gagal": n, "waktu": "..." }.
  email_summary jsonb,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists event_announcements_event_idx
  on public.event_announcements (event_id, pinned desc, published_at desc);

alter table public.event_announcements enable row level security;
revoke all on table public.event_announcements from public, anon, authenticated;

comment on table public.event_announcements is
  'Pengumuman panitia untuk peserta yang masuk ke area peserta (lonceng dan Dashboard saya).';
comment on column public.event_announcements.audience is
  'semua = semua akun area peserta; disetujui = hanya akun yang sudah tertaut ke peserta.';

alter table public.participant_accounts
  add column if not exists announcements_seen_at timestamptz;

comment on column public.participant_accounts.announcements_seen_at is
  'Terakhir peserta membuka lonceng atau Dashboard saya. Pengumuman yang terbit setelahnya dihitung belum dibaca.';
