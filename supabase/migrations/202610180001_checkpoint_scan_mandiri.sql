-- ============================================================================
-- Scan mandiri checkpoint (Check-in > Checkpoints > How it gets done).
-- Disetujui Hanung 2026-10-18 dari mockup "Checkpoint Scan Mandiri".
--
-- Pola QRIS dinamis: panitia MENAMPILKAN QR checkpoint (aplikasi scan, tombol
-- Show QR, atau layar di lokasi), peserta MEMINDAINya dari halaman pesertanya.
-- Kodenya berganti tiap 30 detik dan dihitung server dari SESSION_SECRET, jadi
-- tidak ada rahasia baru di database; foto QR yang dikirim ke grup sudah mati
-- saat dibuka.
--
--   checkpoints.completion       siapa yang memindai:
--                                  staff  panitia memindai QR peserta (bawaan,
--                                         sama dengan sebelum migrasi ini);
--                                  self   peserta memindai QR checkpoint;
--                                  both   keduanya.
--                                Checkpoint barang selalu staff: barangnya harus
--                                diserahkan orang (CHECK di bawah).
--   attendance_scans.method      staff (bawaan, semua catatan lama) atau self.
--   record_checkpoint_self_scan  satu-satunya jalan menulis catatan `self`.
--
-- Hanya menambah dua kolom berbawaan konstan (tanpa menulis ulang tabel), dua
-- CHECK, dan satu fungsi. Tidak ada data yang diubah: semua checkpoint menjadi
-- `staff`, semua catatan lama menjadi `staff`, jadi acara yang sudah jalan
-- berubah 0 px. Satu transaksi: bila satu langkah gagal (mis. lock_timeout),
-- tidak ada yang berubah, dan berkas ini aman dijalankan ulang.
--
-- Aman sebelum atau sesudah kodenya tayang. Kode membaca checkpoint dengan
-- select *, jadi kolom yang belum ada berarti `staff`; menyimpan pilihan selain
-- Staff sebelum migrasi ini dijawab 409 CHECKPOINT_SELF_SCAN_NOT_READY.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.checkpoints
  add column if not exists completion text not null default 'staff';

alter table public.checkpoints drop constraint if exists checkpoints_completion_check;
alter table public.checkpoints
  add constraint checkpoints_completion_check
  check (completion in ('staff', 'self', 'both') and (completion = 'staff' or session_id is not null));

alter table public.attendance_scans
  add column if not exists method text not null default 'staff';

alter table public.attendance_scans drop constraint if exists attendance_scans_method_check;
alter table public.attendance_scans
  add constraint attendance_scans_method_check
  check (method in ('staff', 'self'));

comment on column public.checkpoints.completion is 'Siapa yang memindai: staff (QR peserta), self (peserta memindai QR checkpoint), both.';
comment on column public.attendance_scans.method is 'staff: panitia memindai QR peserta. self: peserta memindai QR checkpoint (record_checkpoint_self_scan).';

-- Peserta memindai QR checkpoint. Kodenya sudah diperiksa route handler; di sini
-- semua aturan yang menyangkut data, dalam satu transaksi:
--   - sesi milik acara ini dan sedang dibuka;
--   - fitur checkpoint menyala, dan ada checkpoint di sesi ini yang boleh
--     dipindai sendiri;
--   - peserta milik acara ini dan tidak dibatalkan;
--   - sudah pernah tercatat di sesi ini: tidak ditulis lagi ('already'), jadi
--     memindai berulang tidak menambah baris atau poin.
-- Baris peserta dikunci (for update) supaya dua ketukan bersamaan menulis satu
-- baris saja.
create or replace function public.record_checkpoint_self_scan(
  p_event_id uuid,
  p_session_id bigint,
  p_participant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sesi public.attendance_sessions;
  peserta_id uuid;
  pertama timestamptz;
begin
  select * into sesi from public.attendance_sessions
   where id = p_session_id and event_id = p_event_id;
  if sesi.id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if not sesi.is_active then
    raise exception 'SESSION_CLOSED';
  end if;

  if not exists (
    select 1 from public.checkpoint_settings where event_id = p_event_id and enabled
  ) or not exists (
    select 1 from public.checkpoints
     where event_id = p_event_id and session_id = p_session_id and completion in ('self', 'both')
  ) then
    raise exception 'SELF_SCAN_OFF';
  end if;

  select id into peserta_id from public.participants
   where id = p_participant_id and event_id = p_event_id and source_removed_at is null
   for update;
  if peserta_id is null then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  select min(scanned_at) into pertama from public.attendance_scans
   where session_id = p_session_id and participant_id = peserta_id;
  if pertama is not null then
    return jsonb_build_object('status', 'already', 'first_scan_at', pertama);
  end if;

  insert into public.attendance_scans (event_id, session_id, participant_id, scanned_by, is_duplicate, method)
  values (p_event_id, p_session_id, peserta_id, null, false, 'self')
  returning scanned_at into pertama;

  return jsonb_build_object('status', 'recorded', 'first_scan_at', pertama);
end $$;

revoke all on function public.record_checkpoint_self_scan(uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.record_checkpoint_self_scan(uuid, bigint, uuid) to service_role;

commit;

notify pgrst, 'reload schema';
