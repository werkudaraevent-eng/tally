-- ============================================================================
-- Kilas balik: kuesioner akhir acara (Admin > Feedback, /e/<slug>/kilas-balik).
--
-- feedback_settings: satu baris per acara. Pertanyaan (jsonb, divalidasi
-- aplikasi: src/lib/kilas-balik/setelan.ts), kartu kenangan yang dinyalakan,
-- jendela buka/tutup, tampilan (`kilas` sekarang; `ringkas` dan `percakapan`
-- disiapkan supaya tampilan berikutnya tidak butuh SQL lagi), tema (kosong =
-- ikut tema acara), kalimat penutup dan nama penanda tangan. Tanpa baris = modul mati, acara lain tidak berubah.
--
-- feedback_responses: satu baris per peserta per acara. Jawaban disimpan
-- sebagai jsonb {kunci pertanyaan: nilai}. Mengirim ulang menimpa jawaban
-- lama (upsert pada kunci utama).
--
-- Hanya dibaca dan ditulis server (service role). Tidak ada fungsi, tidak ada
-- pemicu, tidak menyentuh tabel lain. Tabel baru saja: aman dijalankan ulang.
-- Kode yang memakainya aman sebelum ini dijalankan (modul tampil "belum
-- siap"), dan merge SETELAH ini dijalankan.
-- ============================================================================

begin;
set local lock_timeout = '5s';

create table if not exists public.feedback_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  enabled boolean not null default false,
  title text,
  intro text,
  closing text,
  signed_by text,
  questions jsonb not null default '[]'::jsonb,
  cards jsonb not null default '{}'::jsonb,
  display text not null default 'kilas',
  theme jsonb not null default '{}'::jsonb,
  opens_at timestamptz,
  closes_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  constraint feedback_settings_title_check check (title is null or char_length(title) <= 120),
  constraint feedback_settings_intro_check check (intro is null or char_length(intro) <= 600),
  constraint feedback_settings_closing_check check (closing is null or char_length(closing) <= 600),
  constraint feedback_settings_signed_by_check check (signed_by is null or char_length(signed_by) <= 120),
  constraint feedback_settings_questions_check check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 12),
  constraint feedback_settings_cards_check check (jsonb_typeof(cards) = 'object'),
  constraint feedback_settings_display_check check (display in ('kilas', 'ringkas', 'percakapan')),
  constraint feedback_settings_theme_check check (jsonb_typeof(theme) = 'object'),
  constraint feedback_settings_window_check check (opens_at is null or closes_at is null or opens_at < closes_at)
);

comment on table public.feedback_settings is
  'Kilas balik (Admin > Feedback): pertanyaan, kartu kenangan, jendela buka/tutup. Satu baris per acara; tanpa baris = mati.';

create table if not exists public.feedback_responses (
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null,
  answers jsonb not null,
  submitted_at timestamptz not null default now(),
  primary key (event_id, participant_id),
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete cascade,
  constraint feedback_responses_answers_check check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 20000)
);

comment on table public.feedback_responses is
  'Jawaban Kilas balik, satu baris per peserta. answers = {kunci pertanyaan: nilai}. Kirim ulang menimpa.';

create index if not exists feedback_responses_event_submitted_idx
  on public.feedback_responses (event_id, submitted_at desc);

alter table public.feedback_settings enable row level security;
alter table public.feedback_responses enable row level security;
revoke all on table public.feedback_settings from public, anon, authenticated;
revoke all on table public.feedback_responses from public, anon, authenticated;
grant select, insert, update, delete on table public.feedback_settings to service_role;
grant select, insert, update, delete on table public.feedback_responses to service_role;

commit;

notify pgrst, 'reload schema';
