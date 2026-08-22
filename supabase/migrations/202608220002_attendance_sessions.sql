-- ---------------------------------------------------------------------------
-- Sesi kehadiran: memindai peserta di beberapa titik sepanjang acara.
--
-- Sebelum ini, aplikasi tidak pernah mencatat kehadiran sendiri. Kolom
-- `participants.source_checked_in` dan `source_total_scans` hanya SALINAN dari
-- scanner API, dan satu-satunya pemindaian yang dilakukan aplikasi ini —
-- di layar booth — mencatat transaksi, bukan kehadiran.
--
-- Yang dibangun di sini: daftar checkpoint (registrasi, workshop, makan siang)
-- dan catatan setiap kali seseorang dipindai di salah satunya.
--
-- SETIAP pemindaian disimpan, termasuk yang berulang. Sesi seperti workshop
-- ditinggal dan dimasuki lagi, dan pertanyaan "jam berapa dia kembali" tidak
-- dapat dijawab oleh tabel yang hanya menyimpan pemindaian pertama. Jumlah hadir
-- tetap dihitung dari peserta unik, jadi angka ringkasannya tidak ikut
-- menggelembung.
-- ---------------------------------------------------------------------------

-- Role baru: akun yang HANYA bisa membuka layar pemindai kehadiran.
--
-- Panitia lapangan sering memakai satu ponsel bergantian, dan akun yang juga
-- bisa membuka transaksi, laporan, dan data peserta adalah risiko yang tidak
-- dibutuhkan di pintu masuk.
alter type user_role add value if not exists 'scanner';

create table if not exists public.attendance_sessions (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  -- Slug dipakai di alamat layar pemindai (/scan?sesi=registrasi), sehingga
  -- panitia bisa menempelkan tautan langsung ke satu checkpoint di HP petugas.
  slug text not null,
  sort_order int not null default 0,
  -- Sesi yang ditutup tidak muncul di pemilih layar pemindai. Bukan dihapus:
  -- catatan kehadirannya tetap dibutuhkan setelah acara.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_sessions_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint attendance_sessions_slug_unique unique (event_id, slug)
);

create table if not exists public.attendance_scans (
  id bigint generated always as identity primary key,
  -- event_id disimpan ulang meski sudah bisa ditelusuri lewat sesinya: seluruh
  -- kueri di aplikasi ini menyaring per event, dan join tambahan pada tabel yang
  -- tumbuh paling cepat di hari-H adalah biaya yang tidak perlu dibayar.
  event_id uuid not null references public.events(id) on delete cascade,
  session_id bigint not null references public.attendance_sessions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  -- Petugas yang memindai. `set null` supaya menghapus akun panitia tidak ikut
  -- menghapus bukti kehadiran pesertanya.
  scanned_by uuid references public.users(id) on delete set null,
  -- True bila peserta ini sudah pernah dipindai di sesi yang sama sebelumnya.
  is_duplicate boolean not null default false
);

create index if not exists attendance_scans_session_participant_idx
  on public.attendance_scans (session_id, participant_id);
create index if not exists attendance_scans_event_time_idx
  on public.attendance_scans (event_id, scanned_at desc);

alter table public.attendance_sessions enable row level security;
alter table public.attendance_scans enable row level security;
-- Tanpa policy: seluruh akses lewat service role di route handler, pola yang
-- sama dengan tabel lain di aplikasi ini.

-- ---------------------------------------------------------------------------
-- Pencatatan satu pemindaian.
--
-- Di dalam satu fungsi, bukan tiga kueri dari route handler: dua petugas yang
-- memindai orang yang sama pada detik yang sama harus tetap menghasilkan
-- penandaan duplikat yang benar, dan itu hanya terjamin bila pemeriksaan dan
-- penulisannya berada dalam satu transaksi.
-- ---------------------------------------------------------------------------
create or replace function public.record_attendance_scan(
  p_event_id uuid,
  p_session_id bigint,
  p_qr text,
  p_user uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sesi public.attendance_sessions;
  peserta public.participants;
  sudah int;
  pertama timestamptz;
  unik int;
begin
  select * into sesi from public.attendance_sessions
   where id = p_session_id and event_id = p_event_id;
  if sesi.id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if not sesi.is_active then
    raise exception 'SESSION_CLOSED';
  end if;

  -- Peserta yang sudah dihapus di sumber TIDAK boleh tercatat hadir: namanya
  -- sudah dibatalkan panitia pusat, dan mencatatnya membuat daftar hadir
  -- berbeda dari daftar peserta.
  select * into peserta from public.participants
   where event_id = p_event_id
     and qr_code = btrim(p_qr)
     and source_removed_at is null;

  if peserta.id is null then
    return jsonb_build_object('status', 'not_found', 'qr', btrim(p_qr));
  end if;

  select count(*), min(scanned_at) into sudah, pertama
    from public.attendance_scans
   where session_id = p_session_id and participant_id = peserta.id;

  insert into public.attendance_scans (event_id, session_id, participant_id, scanned_by, is_duplicate)
  values (p_event_id, p_session_id, peserta.id, p_user, sudah > 0);

  select count(distinct participant_id) into unik
    from public.attendance_scans where session_id = p_session_id;

  return jsonb_build_object(
    'status', case when sudah > 0 then 'duplicate' else 'recorded' end,
    'participant', jsonb_build_object(
      'id', peserta.id,
      'name', peserta.name,
      'company', peserta.company,
      'title', peserta.title,
      'qr_code', peserta.qr_code
    ),
    'first_scan_at', pertama,
    'scan_count', sudah + 1,
    'session_unique_total', unik
  );
end $$;

revoke all on function public.record_attendance_scan(uuid, bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.record_attendance_scan(uuid, bigint, text, uuid) to service_role;
