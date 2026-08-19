-- ============================================================================
-- Peserta yang dikelola panitia sendiri: tambah manual, sunting, impor massal,
-- plus kredensial Scanner API per event (P7).
--
-- Satu gagasan menyatukan seluruh berkas ini: `participants` punya DUA jenis
-- baris yang tidak boleh diperlakukan sama.
--
--   BARIS SUMBER  -- `source_participant_id` terisi. Dimiliki Scanner API dan
--                    ditimpa `upsert_external_participants` tiap sinkronisasi.
--   BARIS MANUAL  -- `source_participant_id` NULL. Dimiliki panitia. Sapuan
--                    `source_removed_at` melewatinya (`... is not null` di
--                    penanda hapus), dan upsert-nya juga tidak mengenainya
--                    karena conflict target-nya (event_id, source_participant_id).
--
-- Karena itu penyuntingan baris SUMBER ditolak di sini, bukan sekadar
-- di-disable di UI: kolom yang disunting akan kembali ke nilai lama pada cron
-- lima menit berikutnya, dan suntingan yang hilang diam-diam lebih buruk
-- daripada tombol yang menolak sejak awal. Yang tetap boleh disunting pada
-- baris sumber hanya `email` dan `phone` -- dua kolom yang memang tidak pernah
-- disentuh sinkronisasi karena Scanner API tidak mengirimkannya.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kredensial Scanner API pindah dari env ke baris event.
--
-- Slug sudah per-event sejak 202608110001; base URL dan kunci tertinggal di env
-- karena dulu satu deploy melayani satu klien. Sekarang tidak: dua event bisa
-- memakai penyedia scanner yang berbeda, dan satu env var tidak bisa menunjuk
-- dua endpoint.
--
-- Kuncinya disimpan sebagai teks biasa, TIDAK dienkripsi di kolom. Yang
-- melindunginya adalah RLS tabel `events` plus kenyataan bahwa kolom ini tidak
-- pernah ikut di select mana pun yang hasilnya sampai ke browser -- endpoint
-- CMS mengirim bentuk tersamar. Enkripsi kolom (pgsodium/Vault) menambah kunci
-- kedua yang juga harus disimpan di suatu tempat, dan tempat itu adalah env
-- yang sama yang sedang kita tinggalkan.
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists scanner_api_base_url text,
  add column if not exists scanner_api_key text;

comment on column public.events.scanner_api_base_url is
  'Base URL Scanner API untuk event ini, tanpa garis miring di akhir. NULL = pakai env SCANNER_API_BASE_URL.';
comment on column public.events.scanner_api_key is
  'Bearer token Scanner API untuk event ini. NULL = pakai env SCANNER_API_KEY. Tidak pernah dikirim apa adanya ke browser.';

-- Base URL wajib http/https bila diisi. Diperiksa di database dan bukan hanya
-- di route karena nilai ini dipakai menyusun URL yang lalu di-fetch server:
-- string tanpa skema akan jadi permintaan ke path relatif milik aplikasi
-- sendiri, dan kegagalannya terbaca seperti bug aplikasi, bukan salah setelan.
alter table public.events
  drop constraint if exists events_scanner_base_url_format;
alter table public.events
  add constraint events_scanner_base_url_format check (
    scanner_api_base_url is null or scanner_api_base_url ~ '^https?://[^[:space:]]+$'
  );

-- ---------------------------------------------------------------------------
-- 2. Simpan satu peserta: tambah manual atau sunting baris yang ada.
--
-- Satu fungsi untuk keduanya, bukan dua: penjaga "baris sumber tidak boleh
-- disunting" dan pemeriksaan bentrok `qr_code` berlaku sama persis di kedua
-- jalur, dan menuliskannya dua kali berarti suatu saat hanya satu yang
-- diperbarui.
-- ---------------------------------------------------------------------------
create or replace function public.save_participant(
  p_event_id uuid,
  p_id uuid,
  p_qr_code text,
  p_name text,
  p_company text default null,
  p_title text default null,
  p_email text default null,
  p_phone text default null,
  p_participant_type text default null,
  p_rsvp_status text default null,
  p_actor uuid default null
)
returns public.participants
language plpgsql
security definer
set search_path = public
as $$
declare
  lama public.participants;
  baru public.participants;
  v_qr text := nullif(btrim(coalesce(p_qr_code, '')), '');
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_type text := nullif(btrim(coalesce(p_participant_type, '')), '');
  v_rsvp text := nullif(btrim(coalesce(p_rsvp_status, '')), '');
begin
  if p_event_id is null then
    raise exception using errcode='P0009', message='EVENT_REQUIRED';
  end if;
  if v_qr is null or v_name is null then
    raise exception 'PARTICIPANT_FIELDS_REQUIRED';
  end if;
  -- Sama dengan nilai yang dikirim Scanner API, supaya baris manual dan baris
  -- sumber dapat difilter dengan syarat yang sama di laporan.
  if v_rsvp is not null and v_rsvp not in ('invited', 'confirmed') then
    raise exception 'PARTICIPANT_RSVP_INVALID';
  end if;

  if p_id is not null then
    select * into lama from public.participants
     where id = p_id and event_id = p_event_id for update;
    if lama.id is null then
      raise exception 'PARTICIPANT_NOT_FOUND';
    end if;

    -- Penjaga inti berkas ini. `is distinct from` dan bukan `<>` karena
    -- sebagian besar kolom ini nullable: `<>` menghasilkan NULL saat salah satu
    -- sisi kosong, dan penjaga yang mengembalikan NULL tidak menjaga apa pun.
    if lama.source_participant_id is not null and (
         v_qr is distinct from lama.qr_code
      or v_name is distinct from lama.name
      or v_company is distinct from lama.company
      or v_title is distinct from lama.title
      or v_type is distinct from lama.participant_type
      or v_rsvp is distinct from lama.rsvp_status
    ) then
      raise exception 'PARTICIPANT_SOURCE_LOCKED';
    end if;
  end if;

  -- Bentrok kode diperiksa sendiri supaya pesannya menyebut SIAPA pemakainya.
  -- Dibiarkan jatuh ke 23505, panitia hanya membaca nama indeks unik dan tidak
  -- tahu baris mana yang harus dibereskan.
  if exists (
    select 1 from public.participants
     where event_id = p_event_id and qr_code = v_qr
       and (p_id is null or id <> p_id)
  ) then
    raise exception 'PARTICIPANT_QR_TAKEN';
  end if;

  if p_id is null then
    insert into public.participants (event_id, qr_code, name, company, title, email, phone, participant_type, rsvp_status)
    values (p_event_id, v_qr, v_name, v_company, v_title, v_email, v_phone, v_type, v_rsvp)
    returning * into baru;
  else
    update public.participants
       set qr_code = v_qr, name = v_name, company = v_company, title = v_title,
           email = v_email, phone = v_phone,
           participant_type = v_type, rsvp_status = v_rsvp
     where id = p_id and event_id = p_event_id
    returning * into baru;
  end if;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor,
          case when p_id is null then 'participant_created' else 'participant_updated' end,
          jsonb_build_object('participant_id', baru.id, 'qr_code', baru.qr_code,
                             'name', baru.name,
                             'from_source', baru.source_participant_id is not null,
                             'old', case when p_id is null then null else to_jsonb(lama) end));

  return baru;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Hapus peserta manual.
--
-- Dibatasi baris manual dengan alasan yang sama seperti penyuntingan: baris
-- sumber akan muncul kembali pada sinkronisasi berikutnya, jadi "hapus" di sana
-- adalah janji yang tidak bisa ditepati. Untuk baris sumber yang sudah tidak
-- relevan, sumbernya yang harus dibereskan -- sinkronisasi akan menandainya
-- `source_removed_at` sendiri.
--
-- `undian_winners` ikut diperiksa meski FK-nya `on delete set null`: FK itu
-- KOMPOSIT `(event_id, participant_id)`, dan `set null` mengosongkan `event_id`
-- yang `not null`. Tanpa pemeriksaan ini, menghapus peserta yang pernah menang
-- gagal dengan 23502 yang tidak bisa dijelaskan ke panitia.
-- ---------------------------------------------------------------------------
create or replace function public.delete_participant(
  p_event_id uuid,
  p_id uuid,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_ public.participants;
begin
  select * into row_ from public.participants
   where id = p_id and event_id = p_event_id for update;
  if row_.id is null then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;
  if row_.source_participant_id is not null then
    raise exception 'PARTICIPANT_SOURCE_LOCKED';
  end if;
  if exists (select 1 from public.orders where event_id = p_event_id and participant_id = p_id)
     or exists (select 1 from public.undian_winners where event_id = p_event_id and participant_id = p_id) then
    raise exception 'PARTICIPANT_IN_USE';
  end if;

  -- leaderboard_exclusions dan undian_exclusions ikut CASCADE; pendaftaran
  -- publik yang menunjuk baris ini di-set null dan tetap tersimpan sebagai
  -- jejak bahwa orangnya pernah mendaftar.
  delete from public.participants where id = p_id and event_id = p_event_id;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'participant_deleted',
          jsonb_build_object('participant_id', p_id, 'qr_code', row_.qr_code, 'name', row_.name));

  return jsonb_build_object('id', p_id, 'qr_code', row_.qr_code, 'name', row_.name);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Impor massal.
--
-- `p_dry_run` bukan kemewahan: berkas impor datang dari spreadsheet yang
-- disunting banyak orang, dan satu kolom yang tergeser dapat menimpa ratusan
-- nama sekaligus. Pratinjau memakai fungsi yang SAMA dengan penerapannya,
-- sehingga angka yang dibaca panitia sebelum menekan Terapkan adalah angka yang
-- benar-benar akan terjadi -- bukan hasil hitungan kedua yang bisa berbeda.
--
-- Kunci pencocokan adalah `qr_code`, bukan nama: nama berulang di acara besar
-- (dua "Budi Santoso" bukan hal aneh), sedangkan kode peserta memang sudah unik
-- per event dan dicetak di badge.
--
-- Baris SUMBER yang cocok tidak ditolak, tetapi hanya `email`/`phone`-nya yang
-- diperbarui. Alasannya praktis: berkas kontak dari panitia biasanya memuat
-- SELURUH peserta, dan menolak baris sumber mentah-mentah membuat impor kontak
-- mustahil untuk event yang datanya dari scanner.
-- ---------------------------------------------------------------------------
create or replace function public.import_participants(
  p_event_id uuid,
  p_rows jsonb,
  p_dry_run boolean default false,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  lama public.participants;
  v_qr text; v_name text; v_company text; v_title text;
  v_email text; v_phone text; v_type text; v_rsvp text;
  n_insert int := 0; n_update int := 0; n_locked int := 0; n_reject int := 0;
  baris int := 0;
  terlihat text[] := '{}';
  masalah jsonb := '[]'::jsonb;
begin
  if p_event_id is null then
    raise exception using errcode='P0009', message='EVENT_REQUIRED';
  end if;
  if coalesce(jsonb_array_length(coalesce(p_rows, '[]'::jsonb)), 0) = 0 then
    raise exception 'IMPORT_EMPTY';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'IMPORT_TOO_LARGE';
  end if;

  for item in select * from jsonb_array_elements(p_rows) loop
    baris := baris + 1;
    v_qr := nullif(btrim(coalesce(item->>'qr_code', '')), '');
    v_name := nullif(btrim(coalesce(item->>'name', '')), '');
    v_company := nullif(btrim(coalesce(item->>'company', '')), '');
    v_title := nullif(btrim(coalesce(item->>'title', '')), '');
    v_email := lower(nullif(btrim(coalesce(item->>'email', '')), ''));
    v_phone := nullif(btrim(coalesce(item->>'phone', '')), '');
    v_type := nullif(btrim(coalesce(item->>'participant_type', '')), '');
    v_rsvp := nullif(btrim(coalesce(item->>'rsvp_status', '')), '');

    if v_qr is null or v_name is null then
      n_reject := n_reject + 1;
      masalah := masalah || jsonb_build_object('row', baris, 'qr_code', v_qr,
        'reason', 'Kolom qr_code dan nama wajib diisi.');
      continue;
    end if;
    if v_rsvp is not null and v_rsvp not in ('invited', 'confirmed') then
      n_reject := n_reject + 1;
      masalah := masalah || jsonb_build_object('row', baris, 'qr_code', v_qr,
        'reason', 'rsvp_status hanya boleh invited atau confirmed.');
      continue;
    end if;
    -- Duplikat DI DALAM berkas. Tanpa ini baris terakhir diam-diam menang dan
    -- panitia tidak pernah tahu berkasnya memuat dua entri untuk satu kode.
    if v_qr = any (terlihat) then
      n_reject := n_reject + 1;
      masalah := masalah || jsonb_build_object('row', baris, 'qr_code', v_qr,
        'reason', 'Kode ini muncul lebih dari sekali di berkas.');
      continue;
    end if;
    terlihat := terlihat || v_qr;

    select * into lama from public.participants
     where event_id = p_event_id and qr_code = v_qr;

    if lama.id is null then
      n_insert := n_insert + 1;
      if not p_dry_run then
        insert into public.participants (event_id, qr_code, name, company, title, email, phone, participant_type, rsvp_status)
        values (p_event_id, v_qr, v_name, v_company, v_title, v_email, v_phone, v_type, v_rsvp);
      end if;
    elsif lama.source_participant_id is not null then
      n_locked := n_locked + 1;
      masalah := masalah || jsonb_build_object('row', baris, 'qr_code', v_qr,
        'reason', 'Peserta dari Scanner API. Hanya email dan telepon yang diperbarui.');
      if not p_dry_run then
        update public.participants
           set email = coalesce(v_email, email), phone = coalesce(v_phone, phone)
         where id = lama.id;
      end if;
    else
      n_update := n_update + 1;
      if not p_dry_run then
        update public.participants
           set name = v_name, company = v_company, title = v_title,
               email = v_email, phone = v_phone,
               participant_type = v_type, rsvp_status = v_rsvp
         where id = lama.id;
      end if;
    end if;
  end loop;

  if not p_dry_run then
    insert into public.audit_logs (event_id, user_id, action, payload)
    values (p_event_id, p_actor, 'participants_imported',
            jsonb_build_object('rows', baris, 'inserted', n_insert, 'updated', n_update,
                               'source_locked', n_locked, 'rejected', n_reject));
  end if;

  -- Daftar masalah dipotong 50. Berkas yang salah kolom menghasilkan ribuan
  -- baris identik, dan mengirim semuanya hanya membuat dialog pratinjau tidak
  -- terbaca sekaligus memperbesar payload tanpa menambah informasi.
  return jsonb_build_object(
    'dry_run', p_dry_run, 'rows', baris,
    'inserted', n_insert, 'updated', n_update,
    'source_locked', n_locked, 'rejected', n_reject,
    'issues', (select coalesce(jsonb_agg(e), '[]'::jsonb)
                 from (select e from jsonb_array_elements(masalah) e limit 50) s),
    'issues_truncated', jsonb_array_length(masalah) > 50
  );
end $$;

-- ---------------------------------------------------------------------------
-- 5. Perbaikan `upsert_external_participants`: bentrok kode dengan baris manual.
--
-- Sebelum berkas ini, satu-satunya peserta yang tidak bersumber dari scanner
-- adalah peserta yang pernah dihapus di sumber, jadi loop arsip cukup menengok
-- baris ber-`source_removed_at`. Dengan peserta manual, ada jenis baris kedua
-- yang bisa memegang kode yang kelak dipakai peserta baru di sumber -- dan
-- karena `qr_code` unik per event, satu bentrok menggagalkan SELURUH
-- sinkronisasi dengan 23505, bukan hanya satu baris.
--
-- `elem->>'id' is distinct from p.source_participant_id` menggantikan `<>`:
-- pada baris manual `source_participant_id` NULL, dan `<>` menghasilkan NULL
-- sehingga barisnya tidak pernah cocok -- persis kasus yang perlu ditangkap.
--
-- Yang menang adalah SUMBER. Peserta manual kehilangan kodenya (dipindah ke
-- `<kode>#removed-N`) dan kejadiannya masuk audit_logs. Pilihan sebaliknya --
-- menggagalkan sinkronisasi demi satu baris manual -- membuat seluruh acara
-- berhenti menerima pembaruan peserta di hari-H.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_external_participants(p_event_id uuid, p_participants jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb; synced_count int := 0; updated_count int := 0; inserted_count int := 0;
  removed_count int := 0; restored_count int := 0; archived_count int := 0;
  existing_row public.participants; source_ids text[] := '{}';
  archive_row record; archive_code text; suffix int;
begin
  if p_event_id is null then raise exception using errcode='P0009', message='EVENT_REQUIRED'; end if;

  if coalesce(jsonb_array_length(coalesce(p_participants, '[]'::jsonb)), 0) = 0 then
    return jsonb_build_object('synced',0,'inserted',0,'updated',0,'newly_removed',0,'restored',0,'skipped_empty',true);
  end if;

  select array_agg(elem->>'id') into source_ids from jsonb_array_elements(p_participants) elem;
  source_ids := coalesce(source_ids, '{}'::text[]);

  -- `source_participant_id is not null` tetap: peserta manual bukan peserta
  -- yang "hilang dari sumber", ia memang tidak pernah ada di sana.
  update public.participants
     set source_removed_at = now()
   where event_id = p_event_id
     and source_participant_id is not null
     and source_participant_id <> all (source_ids)
     and source_removed_at is null;
  get diagnostics removed_count = row_count;

  for archive_row in
    select p.id, p.qr_code, p.source_participant_id from public.participants p
    where p.event_id = p_event_id
      and p.qr_code not like '%#removed-%'
      and (p.source_removed_at is not null or p.source_participant_id is null)
      and exists (
        select 1 from jsonb_array_elements(p_participants) elem
        where elem->>'uniqueCode' = p.qr_code
          and elem->>'id' is distinct from p.source_participant_id
      )
  loop
    suffix := 1;
    loop
      archive_code := archive_row.qr_code || '#removed-' || suffix;
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
      'new_qr_code', archive_code,
      'reason', case when archive_row.source_participant_id is null
                     then 'kode peserta manual diambil alih peserta baru di sumber'
                     else 'kode dipakai peserta baru di sumber' end));
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

-- ---------------------------------------------------------------------------
-- Hak akses. Sama seperti RPC operasional lain: hanya service_role, karena
-- ketiganya menulis ke tabel peserta dan hanya route handler yang sudah
-- memeriksa sesi serta cakupan event yang boleh memanggilnya.
-- ---------------------------------------------------------------------------
revoke all on function public.save_participant(uuid, uuid, text, text, text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.save_participant(uuid, uuid, text, text, text, text, text, text, text, text, uuid) to service_role;

revoke all on function public.delete_participant(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_participant(uuid, uuid, uuid) to service_role;

revoke all on function public.import_participants(uuid, jsonb, boolean, uuid) from public, anon, authenticated;
grant execute on function public.import_participants(uuid, jsonb, boolean, uuid) to service_role;
