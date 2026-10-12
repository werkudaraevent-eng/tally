-- ---------------------------------------------------------------------------
-- Impor peserta: kode QR boleh kosong, dan sel kosong tidak menghapus data.
--
-- Sebelumnya baris tanpa qr_code ditolak ("Kolom qr_code dan nama wajib
-- diisi"), padahal daftar dari klien jarang punya kode. Panitia terpaksa
-- mengarang kode sendiri. Kini baris tanpa kode menjadi peserta BARU dengan
-- kode REG dari generate_registration_qr — pembuat kode yang sama dengan form
-- pendaftaran, undangan, dan walk-in.
--
-- Kode buatan dijaga tidak sama dengan kode mana pun yang tertulis di berkas.
-- Tanpa itu, baris 2 bisa mendapat REG000123 lalu baris 40 yang memang
-- bertuliskan REG000123 memperbarui orang yang baru saja dibuat. Kode buatan
-- yang bentrok dengan pendaftaran yang belum di-commit diganti kode lain
-- (on conflict do nothing), bukan membatalkan seluruh impor.
--
-- Mencegah peserta kembar (kasus paling umum: daftar yang sama diimpor dua
-- kali):
--   * Email dicek untuk SETIAP baris. Email milik peserta lain di acara ini,
--     atau email yang sudah dipakai baris sebelumnya di berkas, ditolak dengan
--     menyebut kode orang itu / nomor barisnya. Hasilnya tidak bergantung
--     urutan baris.
--   * Baris TANPA kode dan TANPA email dicek nomor teleponnya, dinormalkan ke
--     angka saja dengan awalan 0 (+62 812..., +62 (0) 812..., 62812..., dan
--     812... dari Excel yang membuang nol semuanya jadi 0812...). Telepon
--     tidak dicek bila baris punya email sendiri atau kode sendiri: nomor
--     kantor atau asisten bersama lazim di daftar klien korporat, dan email
--     atau kode yang berbeda sudah cukup menunjukkan orangnya berbeda.
--   * Nama TIDAK dipakai untuk mencocokkan; orang berbeda bisa bernama sama.
--     Baris tanpa kode, email, dan telepon tetap masuk, dan hitungannya
--     (`unchecked`) ditampilkan di pratinjau sebagai peringatan.
--   * Peserta yang sudah dihapus di Scanner API (source_removed_at) tidak
--     dihitung sebagai pemilik email atau telepon.
--   * Dua penerapan untuk acara yang sama antre lewat advisory lock, jadi
--     yang kedua melihat peserta yang dibuat yang pertama.
--
-- Sel kosong kini TIDAK mengosongkan data peserta yang sudah ada (company,
-- title, email, phone, participant_type, rsvp_status), sama seperti jawaban
-- pertanyaan tambahan sejak 202609050001. Berkas impor lazimnya hanya memuat
-- sebagian kolom; berkas tanpa kolom email tidak boleh menghapus email 300
-- orang. Konsekuensinya: impor tidak bisa mengosongkan sebuah kolom; itu
-- dikerjakan lewat sunting per baris. Nama tetap wajib, jadi tetap ditimpa.
--
-- Tanda tangan, pemilik, dan grant sama dengan sebelumnya. Hasil RPC menambah
-- dua kunci: `generated` (peserta baru dengan kode otomatis) dan `unchecked`
-- (peserta baru tanpa kode, email, dan telepon). Kode lama yang tidak mengenal
-- keduanya tidak terpengaruh.
--
-- Tanpa indeks baru: email dan telepon peserta acara dibaca SEKALI ke objek
-- jsonb di awal, bukan dicari per baris (5.000 baris x seluruh peserta).
-- Daftar masalah dikumpulkan hanya sampai 50; sisanya cukup dihitung.
-- ---------------------------------------------------------------------------
begin;
set local lock_timeout = '5s';

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
  v_hp text;
  v_extra jsonb;
  v_otomatis boolean;
  v_alasan text;
  pemilik text;
  percobaan int;
  n_insert int := 0; n_update int := 0; n_locked int := 0; n_reject int := 0;
  n_generated int := 0; n_unchecked int := 0; n_issue int := 0;
  baris int := 0;
  terlihat text[] := '{}';
  kode_berkas text[];
  email_dipakai jsonb;               -- email -> kode peserta pemiliknya
  hp_dipakai jsonb;                  -- telepon ternormal -> kode peserta pemiliknya
  email_berkas jsonb := '{}'::jsonb; -- email -> nomor baris berkas yang memakainya
  hp_berkas jsonb := '{}'::jsonb;    -- telepon ternormal -> nomor baris berkas
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
  -- Dua penerapan untuk acara yang sama antre. Di READ COMMITTED, peta email
  -- dan telepon di bawah dibaca SETELAH kunci didapat, jadi yang kedua
  -- melihat peserta yang sudah di-commit oleh yang pertama.
  if not p_dry_run then
    perform pg_advisory_xact_lock(hashtextextended('import_participants:' || p_event_id::text, 0));
  end if;

  select coalesce(array_agg(distinct k), '{}') into kode_berkas
    from (select nullif(btrim(coalesce(e->>'qr_code', '')), '') as k
            from jsonb_array_elements(p_rows) e) s
   where k is not null;

  select coalesce(jsonb_object_agg(e, q), '{}'::jsonb) into email_dipakai
    from (select distinct on (lower(btrim(email))) lower(btrim(email)) as e, qr_code as q
            from public.participants
           where event_id = p_event_id and source_removed_at is null
             and nullif(btrim(email), '') is not null
           order by lower(btrim(email)), created_at) s;

  -- Normalisasi telepon yang sama dengan v_hp di dalam loop.
  select coalesce(jsonb_object_agg(h, q), '{}'::jsonb) into hp_dipakai
    from (select distinct on (h) h, q
            from (select case when d like '620%' then substr(d, 3)
                              when d like '62%' then '0' || substr(d, 3)
                              when d like '8%' then '0' || d
                              else d end as h,
                         qr_code as q, created_at
                    from (select regexp_replace(phone, '\D', '', 'g') as d, qr_code, created_at
                            from public.participants
                           where event_id = p_event_id and source_removed_at is null
                             and phone is not null) a) b
           where length(h) >= 8
           order by h, created_at) s;

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
    v_hp := regexp_replace(coalesce(v_phone, ''), '\D', '', 'g');
    v_hp := case when v_hp like '620%' then substr(v_hp, 3)
                 when v_hp like '62%' then '0' || substr(v_hp, 3)
                 when v_hp like '8%' then '0' || v_hp
                 else v_hp end;
    if length(v_hp) < 8 then v_hp := null; end if;

    v_alasan := null;
    if v_name is null then
      v_alasan := 'Name is required.';
    elsif v_rsvp is not null and v_rsvp not in ('invited', 'confirmed') then
      v_alasan := 'rsvp_status can only be invited or confirmed.';
    elsif v_email is not null and (email_dipakai->>v_email) is distinct from coalesce(v_qr, '')
          and email_dipakai ? v_email then
      pemilik := email_dipakai->>v_email;
      v_alasan := format('This email already belongs to participant %s. To update that person, put %s in the qr_code column.', pemilik, pemilik);
    elsif v_email is not null and email_berkas ? v_email then
      v_alasan := format('This email is already used by row %s of the file.', email_berkas->>v_email);
    elsif v_otomatis and v_email is null and v_hp is not null and hp_dipakai ? v_hp then
      pemilik := hp_dipakai->>v_hp;
      v_alasan := format('This phone number already belongs to participant %s. To update that person, put %s in the qr_code column. If this is a different person, add their email or give them their own code.', pemilik, pemilik);
    elsif v_otomatis and v_email is null and v_hp is not null and hp_berkas ? v_hp then
      v_alasan := format('This phone number is already used by row %s of the file.', hp_berkas->>v_hp);
    end if;

    if v_alasan is null and v_otomatis then
      percobaan := 0;
      loop
        v_qr := public.generate_registration_qr(p_event_id);
        exit when not (v_qr = any (kode_berkas)) and not (v_qr = any (terlihat))
              and not exists (select 1 from public.participants
                               where event_id = p_event_id and qr_code = v_qr);
        percobaan := percobaan + 1;
        if percobaan > 50 then
          raise exception 'REGISTRATION_QR_EXHAUSTED';
        end if;
      end loop;
    end if;

    -- Duplikat DI DALAM berkas. Tanpa ini baris terakhir diam-diam menang dan
    -- panitia tidak pernah tahu berkasnya memuat dua entri untuk satu kode.
    if v_alasan is null and v_qr = any (terlihat) then
      v_alasan := 'This code appears more than once in the file.';
    end if;

    if v_alasan is not null then
      n_reject := n_reject + 1;
      n_issue := n_issue + 1;
      if n_issue <= 50 then
        masalah := masalah || jsonb_build_object('row', baris,
          'qr_code', case when v_otomatis then null else v_qr end, 'reason', v_alasan);
      end if;
      continue;
    end if;
    terlihat := terlihat || v_qr;

    select * into lama from public.participants
     where event_id = p_event_id and qr_code = v_qr;

    if lama.id is null then
      n_insert := n_insert + 1;
      if v_otomatis then
        n_generated := n_generated + 1;
        if v_email is null and v_hp is null then n_unchecked := n_unchecked + 1; end if;
      end if;
      if not p_dry_run then
        loop
          insert into public.participants (event_id, qr_code, name, company, title, email, phone, participant_type, rsvp_status, extra)
          values (p_event_id, v_qr, v_name, v_company, v_title, v_email, v_phone, v_type, v_rsvp, v_extra)
          on conflict (event_id, qr_code) do nothing;
          exit when found;
          if not v_otomatis then
            raise exception 'PARTICIPANT_QR_TAKEN';
          end if;
          -- Kode buatan direbut pendaftaran yang belum di-commit saat dicek.
          percobaan := 0;
          loop
            v_qr := public.generate_registration_qr(p_event_id);
            exit when not (v_qr = any (kode_berkas)) and not (v_qr = any (terlihat))
              and not exists (select 1 from public.participants
                               where event_id = p_event_id and qr_code = v_qr);
            percobaan := percobaan + 1;
            if percobaan > 50 then
              raise exception 'REGISTRATION_QR_EXHAUSTED';
            end if;
          end loop;
          terlihat := terlihat || v_qr;
        end loop;
      end if;
    elsif lama.source_participant_id is not null then
      n_locked := n_locked + 1;
      n_issue := n_issue + 1;
      if n_issue <= 50 then
        masalah := masalah || jsonb_build_object('row', baris, 'qr_code', v_qr,
          'reason', 'Participant from Scanner API. Only email, phone and form answers are updated.');
      end if;
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

    -- Kode buatan di pratinjau berbeda dengan saat diterapkan, jadi baris
    -- berkas selalu disebut dengan nomornya, bukan kodenya.
    if v_email is not null and not (email_berkas ? v_email) then
      email_berkas := email_berkas || jsonb_build_object(v_email, baris);
    end if;
    if v_hp is not null and not (hp_berkas ? v_hp) then
      hp_berkas := hp_berkas || jsonb_build_object(v_hp, baris);
    end if;
  end loop;

  if not p_dry_run then
    insert into public.audit_logs (event_id, user_id, action, payload)
    values (p_event_id, p_actor, 'participants_imported',
            jsonb_build_object('rows', baris, 'inserted', n_insert, 'updated', n_update,
                               'generated', n_generated, 'unchecked', n_unchecked,
                               'source_locked', n_locked, 'rejected', n_reject));
  end if;

  return jsonb_build_object(
    'dry_run', p_dry_run, 'rows', baris,
    'inserted', n_insert, 'updated', n_update,
    'generated', n_generated, 'unchecked', n_unchecked,
    'source_locked', n_locked, 'rejected', n_reject,
    'issues', masalah,
    'issues_truncated', n_issue > 50
  );
end $$;

revoke all on function public.import_participants(uuid, jsonb, boolean, uuid) from public, anon, authenticated;
grant execute on function public.import_participants(uuid, jsonb, boolean, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
