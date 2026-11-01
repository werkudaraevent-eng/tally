-- ============================================================================
-- Pemindai petugas: alasan "kode tidak dikenal", aturan pindai ulang per sesi,
-- dan check-in tanpa sinyal per sesi (audit check-in 1 Nov 2026).
--
-- 1. attendance_sessions.repeat_scan: 'allow' (bawaan, perilaku sekarang:
--    pindai ulang = oranye "They can still go in") atau 'stop' (merah
--    "Already used": untuk pintu yang mencegah badge dipinjamkan). Kehadiran
--    dan hitungan tidak berubah; hanya kalimat di lembar petugas.
-- 2. attendance_sessions.offline_ok: bawaan false. Bila true, ponsel petugas
--    yang kehilangan sinyal menyimpan pindaian lalu mengirimnya belakangan
--    dengan waktu pindai aslinya (p_scanned_at). Bila false, p_scanned_at
--    diabaikan dan waktu server dipakai, persis seperti sekarang.
-- 3. record_attendance_scan:
--    - status tetap 'recorded' | 'duplicate' | 'not_found' (bentuk lama utuh).
--    - not_found membawa `reason`: 'cancelled' (peserta acara ini yang sudah
--      dihapus/dibatalkan; kodenya diarsipkan menjadi `<kode>#removed-<n>`,
--      lihat 202607290015) dengan `participant_name` dan `removed_at`, atau
--      'other_event' (kode aktif milik acara lain; nama acara itu TIDAK
--      dikirim, itu data penyelenggara lain), atau tanpa reason.
--    - duplicate membawa `repeat_scan` sesi itu.
--    - p_scanned_at (opsional): hanya dipakai bila sesi offline_ok, dijepit ke
--      [now() - 24 jam, now()].
--    Tanda tangan berubah (parameter ke-6), jadi fungsi lama di-drop dulu:
--    dua overload dengan argumen bernama yang sama membuat PostgREST tidak
--    bisa memilih. Drop + create ada dalam satu transaksi.
-- 4. Indeks participants(qr_code): pencarian 'other_event' lintas acara hanya
--    jalan saat kode tidak ditemukan, tetapi tanpa indeks ia memindai seluruh
--    tabel peserta.
--
-- Satu transaksi, aman dijalankan ulang. Kode lama tetap jalan setelah ini
-- (kolom baru berbawaan, kunci jawaban baru diabaikan, panggilan 5 argumen
-- cocok dengan fungsi baru). Kode baru merge SETELAH ini dijalankan.
-- ============================================================================

begin;
set local lock_timeout = '5s';

alter table public.attendance_sessions
  add column if not exists repeat_scan text not null default 'allow';
alter table public.attendance_sessions drop constraint if exists attendance_sessions_repeat_scan_check;
alter table public.attendance_sessions
  add constraint attendance_sessions_repeat_scan_check check (repeat_scan in ('allow', 'stop'));
comment on column public.attendance_sessions.repeat_scan is
  'Pindai ulang di sesi ini: allow = boleh masuk (bawaan), stop = petugas berhenti dan memeriksa. Hanya kalimat di lembar petugas.';

alter table public.attendance_sessions
  add column if not exists offline_ok boolean not null default false;
comment on column public.attendance_sessions.offline_ok is
  'Ponsel petugas boleh menyimpan pindaian saat tanpa sinyal dan mengirimnya belakangan dengan waktu aslinya. Bawaan false.';

create index if not exists participants_qr_code_idx on public.participants (qr_code);

drop function if exists public.record_attendance_scan(uuid, bigint, text, uuid, bigint);

create or replace function public.record_attendance_scan(
  p_event_id uuid,
  p_session_id bigint,
  p_qr text,
  p_user uuid default null,
  p_lane_id bigint default null,
  p_scanned_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sesi public.attendance_sessions;
  jalur public.attendance_lanes;
  peserta public.participants;
  batal public.participants;
  kode text := btrim(p_qr);
  waktu timestamptz := now();
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

  -- Jalur diperiksa di sini, di dalam transaksi yang sama, bukan lewat kueri
  -- tambahan dari route handler. Nomornya datang dari ponsel petugas, dan jalur
  -- milik acara lain yang lolos akan membuat pemindaian tercatat pada meja yang
  -- tidak ada di ruangan ini.
  if p_lane_id is not null then
    select * into jalur from public.attendance_lanes
     where id = p_lane_id and event_id = p_event_id;
    if jalur.id is null then
      raise exception 'LANE_NOT_FOUND';
    end if;
  end if;

  -- Waktu pindai asli dari antrean ponsel, hanya untuk sesi yang mengizinkan
  -- check-in tanpa sinyal, dan tidak pernah di masa depan atau lebih dari
  -- sehari ke belakang.
  if sesi.offline_ok and p_scanned_at is not null then
    waktu := least(now(), greatest(p_scanned_at, now() - interval '24 hours'));
  end if;

  -- Peserta yang sudah dihapus di sumber TIDAK boleh tercatat hadir: namanya
  -- sudah dibatalkan panitia pusat, dan mencatatnya membuat daftar hadir
  -- berbeda dari daftar peserta.
  select * into peserta from public.participants
   where event_id = p_event_id
     and qr_code = kode
     and source_removed_at is null;

  if peserta.id is null then
    -- Dibatalkan: baris acara ini yang sudah dihapus, dengan kode asli atau
    -- kode arsipnya. Dibandingkan dengan left(), bukan LIKE, supaya `_` dan
    -- `%` di dalam kode tidak menjadi pola.
    select * into batal from public.participants
     where event_id = p_event_id
       and source_removed_at is not null
       and (qr_code = kode or left(qr_code, length(kode) + 9) = kode || '#removed-')
     order by source_removed_at desc
     limit 1;
    if batal.id is not null then
      return jsonb_build_object(
        'status', 'not_found', 'qr', kode, 'reason', 'cancelled',
        'participant_name', batal.name, 'removed_at', batal.source_removed_at
      );
    end if;
    if kode <> '' and exists (
      select 1 from public.participants
       where qr_code = kode and event_id <> p_event_id and source_removed_at is null
    ) then
      return jsonb_build_object('status', 'not_found', 'qr', kode, 'reason', 'other_event');
    end if;
    return jsonb_build_object('status', 'not_found', 'qr', kode);
  end if;

  select count(*), min(scanned_at) into sudah, pertama
    from public.attendance_scans
   where session_id = p_session_id and participant_id = peserta.id;

  insert into public.attendance_scans (event_id, session_id, participant_id, scanned_by, is_duplicate, lane_id, scanned_at)
  values (p_event_id, p_session_id, peserta.id, p_user, sudah > 0, p_lane_id, waktu);

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
    'session_unique_total', unik,
    'repeat_scan', sesi.repeat_scan
  );
end $$;

revoke all on function public.record_attendance_scan(uuid, bigint, text, uuid, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.record_attendance_scan(uuid, bigint, text, uuid, bigint, timestamptz) to service_role;

notify pgrst, 'reload schema';

commit;
