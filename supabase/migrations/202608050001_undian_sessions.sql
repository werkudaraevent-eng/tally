-- ---------------------------------------------------------------------------
-- Sesi undian: pengelompokan hasil, arsip, dan reset yang punya batas jelas.
--
-- Sebelumnya pemenang hanya dikelompokkan per hadiah dan per putaran. Itu cukup
-- selama acara berlangsung, tapi tidak menjawab dua pertanyaan yang muncul
-- sesudahnya:
--
--   "Mana hasil undian sesi gala dinner?"  — tidak ada batas antar sesi.
--   "Sesi siang sudah selesai, bersihkan."  — tidak ada yang bisa ditunjuk
--                                              sebagai lingkup pembersihan.
--
-- Sesi memberi keduanya sebuah batas yang eksplisit dan dibuat sadar oleh
-- panitia, bukan disimpulkan sistem dari tanggal atau jeda waktu. Tebakan
-- otomatis akan salah persis pada acara yang undiannya terpecah pagi dan malam
-- di hari yang sama.
--
-- DUA CARA MENGAKHIRI SESI, dan keduanya sengaja disediakan:
--
--   ARSIP  (status 'closed') — hasil TETAP tersimpan dan tetap bisa diekspor,
--          tapi tidak lagi menghalangi peserta ikut undian berikutnya.
--          Ini yang dipakai di hampir semua kasus.
--
--   HAPUS  — baris pemenang benar-benar dibuang. Hanya untuk membersihkan sisa
--          gladi bersih, dan karena itu dibatasi super_admin lewat route handler.
--
-- Arsip menjadi bawaan karena daftar pemenang adalah bukti serah terima barang.
-- Sistem yang hanya menyediakan "hapus" memaksa panitia memilih antara
-- membersihkan kolam dan menyimpan bukti — dan pada malam acara, yang dipilih
-- selalu yang membuat tombol undi kembali berfungsi.
-- ---------------------------------------------------------------------------

create table if not exists public.undian_sessions (
  id serial primary key,

  name text not null,
  note text,

  -- 'active' = sesi berjalan, pemenangnya menghalangi undian berikutnya.
  -- 'closed' = sesi selesai, hasil diarsipkan.
  --
  -- Sengaja bukan boolean `is_closed`. Kolom teks memberi ruang untuk keadaan
  -- ketiga kelak (mis. 'void' untuk sesi yang dibatalkan) tanpa migrasi yang
  -- mengubah arti kolom lama.
  status text not null default 'active' check (status in ('active', 'closed')),

  started_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.users(id),

  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

-- Hanya SATU sesi boleh aktif pada satu waktu.
--
-- Dua sesi aktif membuat pertanyaan "undian ini masuk sesi mana" tidak punya
-- jawaban, dan sistem terpaksa menebak. Unique index parsial menegakkannya di
-- database, bukan hanya di route handler: jalur lain (SQL manual, perbaikan
-- darurat) tetap tidak bisa melanggarnya.
create unique index if not exists undian_sessions_single_active
  on public.undian_sessions ((status)) where status = 'active';

create index if not exists undian_sessions_recent_idx
  on public.undian_sessions (started_at desc);

-- ---------------------------------------------------------------------------
-- Pemenang menunjuk sesinya.
--
-- ON DELETE SET NULL, bukan CASCADE. Menghapus catatan sesi tidak boleh ikut
-- menghapus catatan siapa membawa pulang hadiah apa — itu dua hal berbeda, dan
-- yang kedua adalah bukti. Pemenang tanpa sesi tetap tampil di riwayat, hanya
-- tanpa pengelompokan.
--
-- NULL juga berarti "diundi sebelum fitur sesi ada", yang benar untuk sepuluh
-- baris yang sudah ada di database saat migrasi ini dijalankan.
-- ---------------------------------------------------------------------------
alter table public.undian_winners
  add column if not exists session_id int references public.undian_sessions(id) on delete set null;

create index if not exists undian_winners_session_idx
  on public.undian_winners (session_id) where session_id is not null;

-- State runtime menunjuk sesi yang sedang berjalan, supaya route pengundian
-- tidak perlu mencari sendiri sesi aktif pada setiap penekanan tombol.
alter table public.undian_state
  add column if not exists session_id int references public.undian_sessions(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Pemenang sesi yang SUDAH DITUTUP tidak lagi menghalangi undian berikutnya.
--
-- Ini inti dari arsip. Fungsi ini menggantikan pembacaan langsung ke
-- undian_winners yang dilakukan src/lib/undian-pool.ts, sehingga aturan
-- "sudah pernah menang" hanya melihat sesi yang masih aktif ditambah pemenang
-- lama yang belum bersesi.
--
-- Pemenang berstatus 'rejected' tetap tidak dihitung, sama seperti sebelumnya:
-- peserta yang namanya keluar lalu ternyata tidak hadir harus kembali ke kolam.
-- ---------------------------------------------------------------------------
create or replace function public.undian_blocking_winner_ids(p_prize_id int, p_scope text)
returns table (participant_id uuid, entry_id bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select w.participant_id, w.entry_id
  from public.undian_winners w
  left join public.undian_sessions s on s.id = w.session_id
  where w.status <> 'rejected'
    and (p_scope <> 'this_prize' or w.prize_id = p_prize_id)
    -- Sesi tertutup diabaikan. Baris tanpa sesi (data sebelum fitur ini ada)
    -- tetap dihitung: tidak ada dasar untuk menganggapnya sudah diarsipkan.
    and (w.session_id is null or s.status = 'active');
$function$;

-- ---------------------------------------------------------------------------
-- Rekap satu sesi, dipakai layar riwayat dan export.
--
-- Satu query mengembalikan seluruh angka yang dibutuhkan, bukan satu query per
-- sesi. Halaman riwayat menampilkan belasan sesi sekaligus.
-- ---------------------------------------------------------------------------
create or replace function public.undian_session_summary()
returns table (
  session_id int,
  name text,
  note text,
  status text,
  started_at timestamptz,
  closed_at timestamptz,
  closed_by_username text,
  prize_count bigint,
  draw_count bigint,
  winner_total bigint,
  winner_confirmed bigint,
  winner_pending bigint,
  winner_rejected bigint,
  first_draw_at timestamptz,
  last_draw_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    s.id,
    s.name,
    s.note,
    s.status,
    s.started_at,
    s.closed_at,
    u.username,
    count(distinct w.prize_id),
    count(distinct (w.prize_id::text || '-' || w.draw_round::text)),
    count(w.id),
    count(w.id) filter (where w.status = 'confirmed'),
    count(w.id) filter (where w.status = 'pending'),
    count(w.id) filter (where w.status = 'rejected'),
    min(w.drawn_at),
    max(w.drawn_at)
  from public.undian_sessions s
  left join public.undian_winners w on w.session_id = s.id
  left join public.users u on u.id = s.closed_by
  group by s.id, s.name, s.note, s.status, s.started_at, s.closed_at, u.username
  order by s.started_at desc;
$function$;

-- ---------------------------------------------------------------------------
-- Keamanan: pola seluruh repo — RLS menyala tanpa policy, akses lewat service role.
-- ---------------------------------------------------------------------------
alter table public.undian_sessions enable row level security;
revoke all on table public.undian_sessions from anon, authenticated;
revoke all on sequence public.undian_sessions_id_seq from anon, authenticated;

revoke all on function public.undian_blocking_winner_ids(int, text) from public, anon, authenticated;
grant execute on function public.undian_blocking_winner_ids(int, text) to service_role;

revoke all on function public.undian_session_summary() from public, anon, authenticated;
grant execute on function public.undian_session_summary() to service_role;

comment on table public.undian_sessions is
  'Pengelompokan hasil undian. Dibuat sadar oleh panitia, bukan disimpulkan dari tanggal: acara bisa punya dua sesi undian di hari yang sama.';
comment on column public.undian_sessions.status is
  'closed = hasil diarsipkan; pemenangnya berhenti menghalangi undian berikutnya tapi datanya tetap utuh dan tetap bisa diekspor.';
comment on column public.undian_winners.session_id is
  'ON DELETE SET NULL, bukan CASCADE: menghapus catatan sesi tidak boleh menghapus bukti siapa membawa pulang hadiah apa. NULL = diundi sebelum fitur sesi ada.';
