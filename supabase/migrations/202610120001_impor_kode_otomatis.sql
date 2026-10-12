-- ---------------------------------------------------------------------------
-- Impor peserta: kode QR boleh kosong, dan sel kosong tidak menghapus data.
--
-- Sebelumnya baris tanpa qr_code ditolak ("Kolom qr_code dan nama wajib
-- diisi"), padahal daftar dari klien jarang punya kode. Panitia terpaksa
-- mengarang kode sendiri. Kini baris tanpa kode menjadi peserta BARU dengan
-- kode REG dari generate_registration_qr — pembuat kode yang sama dengan form
-- pendaftaran, undangan, dan walk-in.
--
-- Kode buatan juga dijaga tidak sama dengan kode mana pun yang tertulis di
-- berkas. Tanpa itu, baris 2 bisa mendapat REG000123 lalu baris 40 yang
-- memang bertuliskan REG000123 memperbarui orang yang baru saja dibuat.
--
-- Baris tanpa kode yang emailnya SUDAH dipakai peserta di acara ini (atau
-- baris sebelumnya di berkas yang sama) ditolak dengan menyebut kode orang
-- itu. Kasus paling umum di sini adalah daftar yang sama diimpor dua kali, dan
-- menolaknya lebih murah daripada membersihkan ratusan peserta kembar.
-- Panitia yang memang ingin memperbarui orang itu cukup menuliskan kodenya.
--
-- Sel kosong kini TIDAK mengosongkan data peserta yang sudah ada (company,
-- title, email, phone, participant_type, rsvp_status), sama seperti jawaban
-- pertanyaan tambahan sejak 202609050001. Berkas impor lazimnya hanya memuat
-- sebagian kolom; berkas tanpa kolom email tidak boleh menghapus email 300
-- orang. Konsekuensinya: impor tidak bisa mengosongkan sebuah kolom; itu
-- dikerjakan lewat sunting per baris. Nama tetap wajib, jadi tetap ditimpa.
--
-- Tanda tangan, pemilik, dan grant sama dengan sebelumnya. Hasil RPC menambah
-- satu kunci, `generated`: berapa peserta baru yang mendapat kode otomatis.
-- Kode lama yang tidak mengenal kunci itu tidak terpengaruh.
--
-- Tanpa indeks baru: email peserta acara dibaca SEKALI ke satu objek jsonb di
-- awal, bukan dicari per baris (5.000 baris x seluruh peserta).
-- ---------------------------------------------------------------------------
set lock_timeout = '5s';

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
  v_otomatis boolean;
  pemilik text;
  percobaan int;
  n_insert int := 0; n_update int := 0; n_locked int := 0; n_reject int := 0;
  n_generated int := 0;
  baris int := 0;
  terlihat text[] := '{}';
  kode_berkas text[];
  email_dipakai jsonb;
  email_berkas text[] := '{}';
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

  select coalesce(array_agg(distinct k), '{}') into kode_berkas
    from (select nullif(btrim(coalesce(e->>'qr_code', '')), '') as k
            from jsonb_array_elements(p_rows) e) s
   where k is not null;

  -- email (huruf kecil) -> kode peserta pemiliknya.
  select coalesce(jsonb_object_agg(e, q), '{}'::jsonb) into email_dipakai
    from (select distinct on (lower(btrim(email))) lower(btrim(email)) as e, qr_code as q
            from public.participants
           where event_id = p_event_id and nullif(btrim(email), '') is not null
           order by lower(btrim(email)), created_at) s;

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
    v_otomatis := v_qr is null;

    if v_name is null then
      n_reject := n_reject + 1;
      masalah := masalah || jsonb_build_object('row', baris, 'qr_code', v_qr,
        'reason', 'Name is required.');
      continue;
    end if;
    if v_rsvp is not null and v_rsvp not in ('invited', 'confirmed') then
      n_reject := n_reject + 1;
      masalah := masalah || jsonb_build_object('row', baris, 'qr_code', v_qr,
        'reason', 'rsvp_status can only be invited or confirmed.');
      continue;
    end if;

    if v_otomatis then
      pemilik := case when v_email is null then null else email_dipakai->>v_email end;
      if pemilik is not null then
        n_reject := n_reject + 1;
        masalah := masalah || jsonb_build_object('row', baris, 'qr_code', null,
          'reason', format('This email already belongs to participant %s. To update that person, put %s in the qr_code column.', pemilik, pemilik));
        continue;
      end if;
      if v_email = any (email_berkas) then
        n_reject := n_reject + 1;
        masalah := masalah || jsonb_build_object('row', baris, 'qr_code', null,
          'reason', 'This email is already used by an earlier row in the file.');
        continue;
      end if;
      percobaan := 0;
      loop
        v_qr := public.generate_registration_qr(p_event_id);
        exit when not (v_qr = any (kode_berkas)) and not (v_qr = any (terlihat));
        percobaan := percobaan + 1;
        if percobaan > 50 then
          raise exception 'REGISTRATION_QR_EXHAUSTED';
        end if;
      end loop;
    end if;

    -- Duplikat DI DALAM berkas. Tanpa ini baris terakhir diam-diam menang dan
    -- panitia tidak pernah tahu berkasnya memuat dua entri untuk satu kode.
    if v_qr = any (terlihat) then
      n_reject := n_reject + 1;
      masalah := masalah || jsonb_build_object('row', baris, 'qr_code', v_qr,
        'reason', 'This code appears more than once in the file.');
      continue;
    end if;
    terlihat := terlihat || v_qr;

    select * into lama from public.participants
     where event_id = p_event_id and qr_code = v_qr;

    if lama.id is null then
      n_insert := n_insert + 1;
      if v_otomatis then n_generated := n_generated + 1; end if;
      -- Kode buatan di pratinjau berbeda dengan saat diterapkan, jadi baris
      -- berkas tidak pernah disebut dengan kodenya.
      if v_email is not null then
        email_berkas := email_berkas || v_email;
      end if;
      if not p_dry_run then
        insert into public.participants (event_id, qr_code, name, company, title, email, phone, participant_type, rsvp_status, extra)
        values (p_event_id, v_qr, v_name, v_company, v_title, v_email, v_phone, v_type, v_rsvp, v_extra);
      end if;
    elsif lama.source_participant_id is not null then
      n_locked := n_locked + 1;
      masalah := masalah || jsonb_build_object('row', baris, 'qr_code', v_qr,
        'reason', 'Participant from Scanner API. Only email, phone and form answers are updated.');
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
           set name = v_name,
               company = coalesce(v_company, company), title = coalesce(v_title, title),
               email = coalesce(v_email, email), phone = coalesce(v_phone, phone),
               participant_type = coalesce(v_type, participant_type),
               rsvp_status = coalesce(v_rsvp, rsvp_status),
               extra = coalesce(extra, '{}'::jsonb) || v_extra
         where id = lama.id;
      end if;
    end if;
  end loop;

  if not p_dry_run then
    insert into public.audit_logs (event_id, user_id, action, payload)
    values (p_event_id, p_actor, 'participants_imported',
            jsonb_build_object('rows', baris, 'inserted', n_insert, 'updated', n_update,
                               'generated', n_generated,
                               'source_locked', n_locked, 'rejected', n_reject));
  end if;

  return jsonb_build_object(
    'dry_run', p_dry_run, 'rows', baris,
    'inserted', n_insert, 'updated', n_update, 'generated', n_generated,
    'source_locked', n_locked, 'rejected', n_reject,
    'issues', (select coalesce(jsonb_agg(e), '[]'::jsonb)
                 from (select e from jsonb_array_elements(masalah) e limit 50) s),
    'issues_truncated', jsonb_array_length(masalah) > 50
  );
end $$;

revoke all on function public.import_participants(uuid, jsonb, boolean, uuid) from public, anon, authenticated;
grant execute on function public.import_participants(uuid, jsonb, boolean, uuid) to service_role;

notify pgrst, 'reload schema';
