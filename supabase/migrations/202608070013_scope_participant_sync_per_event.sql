-- ============================================================================
-- Scope event pada sinkronisasi peserta dari Scanner API.
--
-- TEMUAN OPERASIONAL: sinkronisasi peserta produksi MATI sejak
-- 2026-08-11 06:40:10, tepat setelah migrasi 202608070002 (`event_scoped_data`)
-- dijalankan pada 06:43. `participants.event_id` menjadi NOT NULL sementara RPC
-- lama tidak mengisinya, sehingga cron gagal setiap 15 menit selama 27 jam tanpa
-- ada yang tahu. Bukti: `max(source_synced_at)` dan baris audit `participant_sync`
-- terakhir berhenti pada menit yang sama.
--
-- DUA kebocoran yang ikut ditutup, keduanya diukur:
--
-- 1. `participants_source_id_unique` masih GLOBAL `(source_participant_id)`.
--    Akibatnya `on conflict (source_participant_id)` mengenai baris event LAIN:
--    sync event 2 MENIMPA nama dan QR peserta event 1 sementara `event_id`-nya
--    tetap event 1. DIUKUR: "Dadi Suryadi AR" -> "NAMA DARI EVENT 2".
--    Ini kebocoran paling halus di seluruh fitur: tidak ada galat, tidak ada
--    baris baru, hanya data peserta acara lain yang berubah sendiri.
--
-- 2. `update ... set source_removed_at = now() where source_participant_id
--    <> all(source_ids)` tanpa filter event menandai SELURUH peserta event lain
--    sebagai terhapus, karena source id mereka memang tidak ada di payload event
--    ini. Peserta yang ditandai hilang lalu DITOLAK saat scan di booth.
--
-- Index penggantinya NON-PARTIAL. `on conflict` tidak dapat menyimpulkan index
-- PARTIAL kecuali predikatnya ikut ditulis di klausa inference -- dicoba dengan
-- `where source_participant_id is not null` dan hasilnya 42P10. Non-partial aman:
-- NULL dianggap berbeda di btree unik, jadi peserta yang dibuat manual (tanpa
-- source id) tetap boleh banyak, sama seperti perilaku index global sebelumnya.
--
-- Diuji 5/5: nama peserta event1 UTUH, jumlahnya tidak berubah, yang ditandai
-- terhapus tetap 31 (tidak ikut bertambah), event2 dapat pesertanya sendiri, dan
-- p_event_id null DITOLAK P0009.
-- ============================================================================

drop index if exists public.participants_source_id_unique;
create unique index participants_source_id_event_unique
  on public.participants (event_id, source_participant_id);

drop function if exists public.upsert_external_participants(jsonb);

create function public.upsert_external_participants(p_event_id uuid, p_participants jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  item jsonb; synced_count int := 0; updated_count int := 0; inserted_count int := 0;
  removed_count int := 0; restored_count int := 0; archived_count int := 0;
  existing_row public.participants; source_ids text[] := '{}';
  archive_row record; archive_code text; suffix int;
begin
  -- WAJIB, tanpa default: sinkronisasi menulis ke tabel peserta dan menandai
  -- baris sebagai terhapus. Menebak event di sini berarti merusak data acara lain.
  if p_event_id is null then raise exception using errcode='P0009', message='EVENT_REQUIRED'; end if;

  if coalesce(jsonb_array_length(coalesce(p_participants, '[]'::jsonb)), 0) = 0 then
    return jsonb_build_object('synced',0,'inserted',0,'updated',0,'newly_removed',0,'restored',0,'skipped_empty',true);
  end if;

  select array_agg(elem->>'id') into source_ids from jsonb_array_elements(p_participants) elem;
  source_ids := coalesce(source_ids, '{}'::text[]);

  update public.participants
     set source_removed_at = now()
   where event_id = p_event_id
     and source_participant_id is not null
     and source_participant_id <> all (source_ids)
     and source_removed_at is null;
  get diagnostics removed_count = row_count;

  for archive_row in
    select p.id, p.qr_code from public.participants p
    where p.event_id = p_event_id
      and p.source_removed_at is not null
      and p.qr_code not like '%#removed-%'
      and exists (
        select 1 from jsonb_array_elements(p_participants) elem
        where elem->>'uniqueCode' = p.qr_code and elem->>'id' <> p.source_participant_id
      )
  loop
    suffix := 1;
    loop
      archive_code := archive_row.qr_code || '#removed-' || suffix;
      -- Keunikan qr_code kini per event, jadi pencarian kode arsip yang bebas
      -- juga harus per event; tanpa itu nomor urutnya melompat tanpa sebab.
      exit when not exists (
        select 1 from public.participants where qr_code = archive_code and event_id = p_event_id
      );
      suffix := suffix + 1;
    end loop;
    update public.participants set qr_code = archive_code where id = archive_row.id;
    archived_count := archived_count + 1;
    insert into public.audit_logs (event_id, action, payload)
    values (p_event_id, 'participant_qr_archived', jsonb_build_object(
      'participant_id', archive_row.id, 'old_qr_code', archive_row.qr_code,
      'new_qr_code', archive_code, 'reason', 'kode dipakai peserta baru di sumber'));
  end loop;

  for item in select * from jsonb_array_elements(p_participants) loop
    select * into existing_row from public.participants
    where source_participant_id = item->>'id' and event_id = p_event_id for update;

    if existing_row.id is not null and existing_row.source_removed_at is not null then
      restored_count := restored_count + 1;
    end if;

    insert into public.participants (event_id, qr_code, name, company, title, allow_name_display, source_participant_id, participant_type, rsvp_status, seats, source_checked_in, source_total_scans, source_first_scan_at, source_synced_at, source_removed_at)
    values (p_event_id, item->>'uniqueCode', item->>'fullName', item->>'affiliation', item->>'jobTitle', coalesce(existing_row.allow_name_display, true), item->>'id', item->>'participantType', item->>'rsvpStatus', coalesce(item->'seats','[]'::jsonb), coalesce((item->>'checkedIn')::boolean,false), coalesce((item->>'totalScans')::int,0), nullif(item->>'firstScanAt','')::timestamptz, now(), null)
    on conflict (event_id, source_participant_id) do update set
      qr_code = excluded.qr_code, name = excluded.name, company = excluded.company,
      title = excluded.title, participant_type = excluded.participant_type,
      rsvp_status = excluded.rsvp_status, seats = excluded.seats,
      source_checked_in = excluded.source_checked_in,
      source_total_scans = excluded.source_total_scans,
      source_first_scan_at = excluded.source_first_scan_at,
      source_synced_at = excluded.source_synced_at, source_removed_at = null;

    synced_count := synced_count + 1;
    if existing_row.id is null then inserted_count := inserted_count + 1; else updated_count := updated_count + 1; end if;
  end loop;

  return jsonb_build_object('synced',synced_count,'inserted',inserted_count,'updated',updated_count,
    'newly_removed',removed_count,'restored',restored_count,'archived_qr',archived_count,
    'total_removed',(select count(*) from public.participants where event_id=p_event_id and source_removed_at is not null));
end $$;

revoke all on function public.upsert_external_participants(uuid, jsonb) from public, anon, authenticated;
