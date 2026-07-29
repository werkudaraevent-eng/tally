-- Opsi 1: bebaskan kode badge saat peserta ditandai hilang dari sumber.
--
-- Masalah yang diperbaiki (terbukti dari log Postgres produksi):
--   ERROR: duplicate key value violates unique constraint "participants_qr_code_key"
--
-- Mekanismenya:
-- 1. BR-16/Opsi A menyimpan peserta yang dihapus di sumber (source_removed_at
--    terisi) untuk audit, jadi barisnya TETAP menempati `qr_code`-nya.
-- 2. upsert_external_participants mencocokkan peserta lewat source_participant_id.
--    Kalau panitia pusat menghapus peserta lalu mendaftarkan orang lain memakai
--    kode badge yang sama, source_participant_id-nya berbeda sehingga upsert
--    menganggapnya peserta BARU dan mencoba INSERT.
-- 3. INSERT itu ditolak unique constraint karena kode masih dipegang baris lama.
--
-- Dampak yang dicegah: exception membatalkan SELURUH transaksi sync, sehingga
-- ratusan peserta lain ikut gagal ter-update, bukan hanya satu baris bermasalah.
--
-- Perbaikan: saat baris ditandai hilang, `qr_code`-nya diarsipkan menjadi
-- `<kode>#removed-<n>` sehingga kode aslinya bebas dipakai peserta baru. Nama,
-- perusahaan, tipe, dan seluruh riwayat order tetap utuh untuk audit.
--
-- Kenapa bukan mengganti unique constraint jadi partial (hanya baris aktif):
-- lookup QR presis di jalur kasir (`eq("qr_code", ...)`) tidak memfilter baris
-- bertanda, jadi kode duplikat akan membuat `.single()` gagal atau mengembalikan
-- peserta yang salah. Mengarsipkan kode menyelesaikannya tanpa menyentuh satu pun
-- jalur baca.
--
-- Format `#removed-` dipilih karena `#` tidak mungkin muncul di kode badge asli
-- (PEGxxxxx), jadi tidak ada risiko bentrok dengan kode yang sah.

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
  archived_count int := 0;
  existing_row public.participants;
  source_ids text[] := '{}';
  archive_row record;
  archive_code text;
  suffix int;
begin
  -- Payload kosong tidak boleh menandai seluruh tabel sebagai terhapus. Itu pola
  -- kegagalan API (timeout, respons kosong), bukan sinyal event dibatalkan.
  if coalesce(jsonb_array_length(coalesce(p_participants, '[]'::jsonb)), 0) = 0 then
    return jsonb_build_object('synced', 0, 'inserted', 0, 'updated', 0, 'newly_removed', 0, 'restored', 0, 'skipped_empty', true);
  end if;

  -- Kumpulkan dulu daftar id dari sumber.
  select array_agg(elem->>'id') into source_ids
  from jsonb_array_elements(p_participants) elem;
  source_ids := coalesce(source_ids, '{}'::text[]);

  -- TAHAP 1: tandai yang tidak ada lagi di sumber, SEBELUM insert/update.
  -- Urutan ini penting: pengarsipan kode harus terjadi sebelum peserta baru
  -- mencoba memakai kode yang sama, kalau tidak INSERT-nya tetap bentrok.
  update public.participants
     set source_removed_at = now()
   where source_participant_id is not null
     and source_participant_id <> all (source_ids)
     and source_removed_at is null;
  get diagnostics removed_count = row_count;

  -- TAHAP 2: arsipkan kode badge milik baris bertanda yang kodenya dibutuhkan
  -- peserta lain di payload ini. Hanya yang benar-benar bentrok yang diarsipkan,
  -- supaya kode di layar admin tidak berubah tanpa alasan.
  for archive_row in
    select p.id, p.qr_code
    from public.participants p
    where p.source_removed_at is not null
      and p.qr_code not like '%#removed-%'
      and exists (
        select 1 from jsonb_array_elements(p_participants) elem
        where elem->>'uniqueCode' = p.qr_code
          and elem->>'id' <> p.source_participant_id
      )
  loop
    -- Cari sufiks bebas; peserta bisa dihapus lalu kodenya dipakai ulang berkali-kali.
    suffix := 1;
    loop
      archive_code := archive_row.qr_code || '#removed-' || suffix;
      exit when not exists (select 1 from public.participants where qr_code = archive_code);
      suffix := suffix + 1;
    end loop;

    update public.participants set qr_code = archive_code where id = archive_row.id;
    archived_count := archived_count + 1;

    insert into public.audit_logs (action, payload)
    values ('participant_qr_archived', jsonb_build_object(
      'participant_id', archive_row.id,
      'old_qr_code', archive_row.qr_code,
      'new_qr_code', archive_code,
      'reason', 'kode dipakai peserta baru di sumber'));
  end loop;

  -- TAHAP 3: insert/update peserta dari sumber.
  for item in select * from jsonb_array_elements(p_participants) loop
    select * into existing_row from public.participants where source_participant_id = item->>'id' for update;

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
  end loop;

  return jsonb_build_object(
    'synced', synced_count,
    'inserted', inserted_count,
    'updated', updated_count,
    'newly_removed', removed_count,
    'restored', restored_count,
    'archived_qr', archived_count,
    'total_removed', (select count(*) from public.participants where source_removed_at is not null)
  );
end;
$function$;

revoke all on function public.upsert_external_participants(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_external_participants(jsonb) to service_role;
