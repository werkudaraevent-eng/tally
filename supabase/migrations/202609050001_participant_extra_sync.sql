-- ============================================================================
-- Jawaban field tambahan ikut di jalur manual dan impor.
--
-- `participants.extra` sudah ada sejak 202608200001 dan terisi saat pendaftaran
-- publik disetujui. Tetapi dua jalur lain yang menulis peserta — tambah/sunting
-- manual (`save_participant`) dan impor berkas (`import_participants`) — tidak
-- mengenal kolom itu sama sekali. Akibatnya terlihat di CMS: admin menambah
-- pertanyaan di form publik, jawabannya masuk untuk pendaftar daring, tetapi
-- peserta yang ditambah panitia atau diimpor dari spreadsheet tidak pernah bisa
-- punya jawaban yang sama. Satu daftar peserta, dua jenis baris.
--
-- Migrasi ini menambahkan `extra` ke keduanya. Isi yang sah (kunci yang
-- dikenal, pilihan yang ada di daftarnya) diperiksa di route handler yang punya
-- akses ke konfigurasi form; fungsi di sini hanya menjaga bentuknya berupa
-- objek JSON.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. save_participant: parameter `p_extra`.
--
-- Tanda tangannya berubah, jadi versi lama DIHAPUS lebih dulu. `create or
-- replace` dengan daftar parameter berbeda membuat fungsi kedua, bukan
-- mengganti — dan PostgREST menolak memanggil nama yang punya dua definisi.
--
-- `null` berarti "biarkan seperti semula". Berbeda dari kolom lain yang selalu
-- ditulis ulang tiap penyimpanan: pemanggil lama yang tidak tahu kolom ini ada
-- tidak boleh menghapus jawaban pendaftar hanya karena tidak mengirimnya.
-- Objek kosong `{}` berarti "kosongkan".
--
-- Baris Scanner API BOLEH diubah jawabannya: sumber tidak mengirim kolom ini,
-- sama seperti email dan telepon, jadi sinkronisasi tidak punya nilai untuk
-- menimpanya.
-- ---------------------------------------------------------------------------
drop function if exists public.save_participant(uuid, uuid, text, text, text, text, text, text, text, text, uuid);

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
  p_actor uuid default null,
  p_extra jsonb default null
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
  if p_extra is not null and jsonb_typeof(p_extra) <> 'object' then
    raise exception 'PARTICIPANT_EXTRA_INVALID';
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
    insert into public.participants (event_id, qr_code, name, company, title, email, phone, participant_type, rsvp_status, extra)
    values (p_event_id, v_qr, v_name, v_company, v_title, v_email, v_phone, v_type, v_rsvp, coalesce(p_extra, '{}'::jsonb))
    returning * into baru;
  else
    update public.participants
       set qr_code = v_qr, name = v_name, company = v_company, title = v_title,
           email = v_email, phone = v_phone,
           participant_type = v_type, rsvp_status = v_rsvp,
           extra = coalesce(p_extra, extra)
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
-- 2. import_participants: tiap baris boleh membawa objek `extra`.
--
-- Pada baris yang SUDAH ADA, jawaban DIGABUNG (`||`), bukan diganti utuh.
-- Berkas impor lazimnya hanya memuat kolom yang sedang diperbarui panitia —
-- daftar kontak, misalnya — dan berkas tanpa kolom "ukuran kaus" tidak boleh
-- menghapus ukuran kaus yang sudah diisi pendaftar. Konsekuensinya: impor tidak
-- bisa MENGOSONGKAN sebuah jawaban; itu dikerjakan lewat sunting per baris.
--
-- Baris Scanner API ikut menerima jawaban, sejajar dengan email dan telepon:
-- sumber tidak mengirim ketiganya, jadi tidak ada yang akan menimpanya.
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
  v_extra jsonb;
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
    v_extra := case when jsonb_typeof(item->'extra') = 'object' then item->'extra' else '{}'::jsonb end;

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
        insert into public.participants (event_id, qr_code, name, company, title, email, phone, participant_type, rsvp_status, extra)
        values (p_event_id, v_qr, v_name, v_company, v_title, v_email, v_phone, v_type, v_rsvp, v_extra);
      end if;
    elsif lama.source_participant_id is not null then
      n_locked := n_locked + 1;
      masalah := masalah || jsonb_build_object('row', baris, 'qr_code', v_qr,
        'reason', 'Peserta dari Scanner API. Hanya email, telepon, dan jawaban tambahan yang diperbarui.');
      if not p_dry_run then
        update public.participants
           set email = coalesce(v_email, email), phone = coalesce(v_phone, phone),
               extra = coalesce(extra, '{}'::jsonb) || v_extra
         where id = lama.id;
      end if;
    else
      n_update := n_update + 1;
      if not p_dry_run then
        update public.participants
           set name = v_name, company = v_company, title = v_title,
               email = v_email, phone = v_phone,
               participant_type = v_type, rsvp_status = v_rsvp,
               extra = coalesce(extra, '{}'::jsonb) || v_extra
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
