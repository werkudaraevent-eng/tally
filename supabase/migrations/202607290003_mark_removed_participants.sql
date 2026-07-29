-- Opsi A: tandai peserta yang hilang dari sumber, jangan hapus.
--
-- Masalah: upsert_external_participants hanya insert/update. Peserta yang
-- dihapus di sistem panitia pusat tertinggal di tabel ini selamanya, sehingga
-- total lokal terus melebihi dashboard sumber (kasus nyata: 224 vs 222).
--
-- Kenapa ditandai, bukan dihapus:
-- - Kalau API sumber suatu saat gagal mengirim sebagian data, penghapusan
--   otomatis akan membuang peserta yang sebenarnya valid. Tidak bisa dibalik.
-- - Peserta yang sudah bertransaksi harus tetap dapat diaudit setelah acara.
--
-- Peserta bertanda source_removed_at disembunyikan dari pencarian booth dan
-- kasir, tapi barisnya tetap ada dan order lamanya tetap utuh.

alter table public.participants
  add column if not exists source_removed_at timestamptz;

comment on column public.participants.source_removed_at is
  'Diisi saat peserta tidak lagi muncul di respons Scanner API. NULL = masih aktif di sumber.';

-- Pencarian booth/kasir selalu memfilter kolom ini, jadi indeks partial menjaga
-- query tetap memakai indeks yang ada tanpa memindai baris bertanda.
create index if not exists participants_active_idx
  on public.participants (name)
  where source_removed_at is null;

create or replace function public.upsert_external_participants(p_participants jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  item jsonb;
  synced_count int := 0;
  updated_count int := 0;
  inserted_count int := 0;
  removed_count int := 0;
  restored_count int := 0;
  existing_row public.participants;
  source_ids text[] := '{}';
begin
  -- Payload kosong tidak boleh menandai seluruh tabel sebagai terhapus. Itu
  -- pola kegagalan API (timeout, respons kosong), bukan sinyal event dibatalkan.
  if coalesce(jsonb_array_length(coalesce(p_participants, '[]'::jsonb)), 0) = 0 then
    return jsonb_build_object('synced', 0, 'inserted', 0, 'updated', 0, 'removed', 0, 'restored', 0, 'skipped_empty', true);
  end if;

  for item in select * from jsonb_array_elements(p_participants) loop
    select * into existing_row from public.participants where source_participant_id = item->>'id' for update;

    -- Peserta yang muncul lagi di sumber dipulihkan, bukan dibiarkan bertanda.
    if existing_row.id is not null and existing_row.source_removed_at is not null then
      restored_count := restored_count + 1;
    end if;

    insert into public.participants (qr_code, name, company, title, allow_name_display, source_participant_id, participant_type, rsvp_status, seats, source_checked_in, source_total_scans, source_first_scan_at, source_synced_at, source_removed_at)
    values (item->>'uniqueCode', item->>'fullName', item->>'affiliation', item->>'jobTitle', coalesce(existing_row.allow_name_display, true), item->>'id', item->>'participantType', item->>'rsvpStatus', coalesce(item->'seats', '[]'::jsonb), coalesce((item->>'checkedIn')::boolean, false), coalesce((item->>'totalScans')::int, 0), nullif(item->>'firstScanAt', '')::timestamptz, now(), null)
    on conflict (source_participant_id) do update set
      qr_code = excluded.qr_code,
      name = excluded.name,
      company = excluded.company,
      title = excluded.title,
      participant_type = excluded.participant_type,
      rsvp_status = excluded.rsvp_status,
      seats = excluded.seats,
      source_checked_in = excluded.source_checked_in,
      source_total_scans = excluded.source_total_scans,
      source_first_scan_at = excluded.source_first_scan_at,
      source_synced_at = excluded.source_synced_at,
      source_removed_at = null;

    synced_count := synced_count + 1;
    if existing_row.id is null then inserted_count := inserted_count + 1; else updated_count := updated_count + 1; end if;
    source_ids := source_ids || (item->>'id');
  end loop;

  -- Tandai yang tidak ada di payload. Baris tanpa source_participant_id
  -- (mis. data uji manual) tidak ikut ditandai karena bukan milik sumber.
  update public.participants
     set source_removed_at = now()
   where source_participant_id is not null
     and source_participant_id <> all (source_ids)
     and source_removed_at is null;
  get diagnostics removed_count = row_count;

  return jsonb_build_object(
    'synced', synced_count,
    'inserted', inserted_count,
    'updated', updated_count,
    'newly_removed', removed_count,
    'restored', restored_count,
    'total_removed', (select count(*) from public.participants where source_removed_at is not null)
  );
end;
$function$;

revoke all on function public.upsert_external_participants(jsonb) from anon;
