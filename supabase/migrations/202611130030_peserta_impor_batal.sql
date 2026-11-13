-- ---------------------------------------------------------------------------
-- "Undo import" untuk impor peserta (Participant list > Import > Participant
-- details, berkas biasa maupun yang disiapkan AI).
--
-- participant_imports: satu baris per impor peserta yang tersimpan dan
-- mengubah sesuatu. `changes` berisi setiap peserta yang ditambah (before
-- null) atau diubah, dengan kolom yang bisa diubah impor sebelum dan
-- sesudahnya. Hanya service role: RLS menyala tanpa policy.
--
-- import_participants ditulis ulang hanya untuk mengisi `changes` dan
-- mengembalikan `import_id`; aturan impornya tidak berubah. Pemeriksaan md5 di
-- bawah menghentikan migrasi bila badan fungsi di database bukan versi
-- 202610120001 yang menjadi dasar penulisan ulang ini.
--
-- undo_participant_import: hanya impor terakhir acara itu yang belum
-- dibatalkan, paling lama 7 hari, sekali. Peserta yang kolomnya masih sama
-- dengan sesudah impor dikembalikan; peserta baru dihapus hanya bila belum
-- punya catatan apa pun di tabel lain (check-in, logistik, pesan, dst.,
-- dibaca dari foreign key ke participants). Yang lain dibiarkan dan disebut.
-- `p_dry_run` = pratinjau dengan hitungan yang sama.
-- ---------------------------------------------------------------------------

begin;
set local lock_timeout = '5s';

do $guard$
begin
  if (select md5(replace(prosrc, E'\r', '')) from pg_proc
       where oid = 'public.import_participants(uuid,jsonb,boolean,uuid)'::regprocedure)
     is distinct from 'f3b8a04f6a54825f91269a9ce988ae9d' then
    raise exception 'import_participants is not the 202610120001 version. Stop and check with the author.';
  end if;
end $guard$;

create table if not exists public.participant_imports (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  ai_run_id bigint references public.ai_runs(id) on delete set null,
  changes jsonb not null check (jsonb_typeof(changes) = 'array'),
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  undone_at timestamptz,
  undone_by uuid references public.users(id) on delete set null,
  undo_result jsonb check (undo_result is null or jsonb_typeof(undo_result) = 'object')
);

create index if not exists participant_imports_event_created_idx on public.participant_imports (event_id, created_at desc);

alter table public.participant_imports enable row level security;
revoke all on table public.participant_imports from public, anon, authenticated;
grant select, insert, update on table public.participant_imports to service_role;

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
  -- Undo: tiap peserta yang ditambah atau diubah, dengan kolomnya sebelum dan sesudah.
  v_id uuid;
  v_sebelum jsonb;
  v_sesudah jsonb;
  perubahan jsonb := '[]'::jsonb;
  v_impor bigint;
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
          on conflict (event_id, qr_code) do nothing
          returning id, jsonb_build_object('name', name, 'company', company, 'title', title, 'email', email, 'phone', phone,
                                           'participant_type', participant_type, 'rsvp_status', rsvp_status, 'extra', extra)
               into v_id, v_sesudah;
          if found then
            perubahan := perubahan || jsonb_build_array(jsonb_build_object('id', v_id, 'before', null, 'after', v_sesudah));
          end if;
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
        v_sebelum := jsonb_build_object('name', lama.name, 'company', lama.company, 'title', lama.title, 'email', lama.email, 'phone', lama.phone,
                                        'participant_type', lama.participant_type, 'rsvp_status', lama.rsvp_status, 'extra', lama.extra);
        update public.participants
           set email = coalesce(v_email, email), phone = coalesce(v_phone, phone),
               extra = coalesce(extra, '{}'::jsonb) || v_extra
         where id = lama.id
        returning jsonb_build_object('name', name, 'company', company, 'title', title, 'email', email, 'phone', phone,
                                     'participant_type', participant_type, 'rsvp_status', rsvp_status, 'extra', extra)
             into v_sesudah;
        if v_sesudah is distinct from v_sebelum then
          perubahan := perubahan || jsonb_build_array(jsonb_build_object('id', lama.id, 'before', v_sebelum, 'after', v_sesudah));
        end if;
      end if;
    else
      n_update := n_update + 1;
      if not p_dry_run then
        v_sebelum := jsonb_build_object('name', lama.name, 'company', lama.company, 'title', lama.title, 'email', lama.email, 'phone', lama.phone,
                                        'participant_type', lama.participant_type, 'rsvp_status', lama.rsvp_status, 'extra', lama.extra);
        update public.participants
           set name = v_name,
               company = coalesce(v_company, company), title = coalesce(v_title, title),
               email = coalesce(v_email, email), phone = coalesce(v_phone, phone),
               participant_type = coalesce(v_type, participant_type),
               rsvp_status = coalesce(v_rsvp, rsvp_status),
               extra = coalesce(extra, '{}'::jsonb) || v_extra
         where id = lama.id
        returning jsonb_build_object('name', name, 'company', company, 'title', title, 'email', email, 'phone', phone,
                                     'participant_type', participant_type, 'rsvp_status', rsvp_status, 'extra', extra)
             into v_sesudah;
        if v_sesudah is distinct from v_sebelum then
          perubahan := perubahan || jsonb_build_array(jsonb_build_object('id', lama.id, 'before', v_sebelum, 'after', v_sesudah));
        end if;
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
    if jsonb_array_length(perubahan) > 0 then
      insert into public.participant_imports (event_id, user_id, changes, counts)
      values (p_event_id, p_actor, perubahan,
              jsonb_build_object('rows', baris, 'inserted', n_insert, 'updated', n_update,
                                 'source_locked', n_locked, 'rejected', n_reject))
      returning id into v_impor;
    end if;
  end if;

  return jsonb_build_object(
    'dry_run', p_dry_run, 'rows', baris,
    'inserted', n_insert, 'updated', n_update,
    'generated', n_generated, 'unchecked', n_unchecked,
    'source_locked', n_locked, 'rejected', n_reject,
    'issues', masalah,
    'issues_truncated', n_issue > 50,
    'import_id', v_impor
  );
end $$;

revoke all on function public.import_participants(uuid, jsonb, boolean, uuid) from public, anon, authenticated;
grant execute on function public.import_participants(uuid, jsonb, boolean, uuid) to service_role;

create or replace function public.undo_participant_import(
  p_event_id uuid,
  p_import_id bigint,
  p_dry_run boolean default true,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  imp public.participant_imports;
  terbaru bigint;
  c jsonb;
  v_id uuid;
  v_nama text;
  skrg jsonb;
  baru uuid[];
  terpakai uuid[] := '{}';
  fk record;
  ketemu uuid[];
  n_hapus int := 0; n_pulih int := 0; n_tetap int := 0;
  tetap jsonb := '[]'::jsonb;
  hasil jsonb;
begin
  if p_event_id is null or p_import_id is null then
    raise exception using errcode = 'P0009', message = 'EVENT_REQUIRED';
  end if;
  -- Antre dengan impor peserta acara yang sama, supaya undo tidak berjalan
  -- di tengah impor berikutnya.
  if not p_dry_run then
    perform pg_advisory_xact_lock(hashtextextended('import_participants:' || p_event_id::text, 0));
  end if;

  select * into imp from public.participant_imports
   where id = p_import_id and event_id = p_event_id
   for update;
  if imp.id is null then raise exception 'IMPORT_NOT_FOUND'; end if;
  if imp.undone_at is not null then raise exception 'IMPORT_ALREADY_UNDONE'; end if;
  if imp.created_at < now() - interval '7 days' then raise exception 'IMPORT_TOO_OLD'; end if;
  select max(id) into terbaru from public.participant_imports
   where event_id = p_event_id and undone_at is null;
  if terbaru is distinct from imp.id then raise exception 'IMPORT_NOT_LATEST'; end if;

  -- Peserta baru yang sudah dirujuk tabel lain (check-in, logistik, pesan,
  -- undian, ...) tidak dihapus. Daftar tabel dibaca dari foreign key, jadi
  -- tabel yang ditambahkan kelak ikut terjaga.
  select coalesce(array_agg((e->>'id')::uuid), '{}') into baru
    from jsonb_array_elements(imp.changes) e
   where e->'before' is null or jsonb_typeof(e->'before') = 'null';
  if cardinality(baru) > 0 then
    -- Kunci baris peserta baru dulu: check-in yang masuk di antara pemeriksaan
    -- dan penghapusan tidak ikut terhapus lewat ON DELETE CASCADE.
    perform 1 from public.participants where event_id = p_event_id and id = any(baru) for update;
    -- Data sesudah impor yang tersimpan di baris peserta itu sendiri: kursi,
    -- foto, walk-in. Dibaca lewat to_jsonb karena kolom ini tidak semua ada di
    -- migrasi repo (seats hanya di produksi).
    select terpakai || coalesce(array_agg(p.id), '{}') into terpakai
      from public.participants p
     where p.event_id = p_event_id and p.id = any(baru)
       and ((jsonb_typeof(to_jsonb(p)->'seats') = 'array' and jsonb_array_length(to_jsonb(p)->'seats') > 0)
            or coalesce(to_jsonb(p)->>'photo_url', '') <> ''
            or (to_jsonb(p)->'walk_in_at') is not null and jsonb_typeof(to_jsonb(p)->'walk_in_at') <> 'null');
    for fk in
      select c2.conrelid::regclass as tabel, a.attname as kolom
        from pg_constraint c2
        cross join lateral unnest(c2.conkey, c2.confkey) as k(asal, tuju)
        join pg_attribute a on a.attrelid = c2.conrelid and a.attnum = k.asal
        join pg_attribute b on b.attrelid = c2.confrelid and b.attnum = k.tuju
       where c2.contype = 'f' and c2.confrelid = 'public.participants'::regclass and b.attname = 'id'
    loop
      execute format('select coalesce(array_agg(distinct %I), ''{}'') from %s where %I = any($1)', fk.kolom, fk.tabel, fk.kolom)
        into ketemu using baru;
      terpakai := terpakai || ketemu;
    end loop;
  end if;

  for c in select * from jsonb_array_elements(imp.changes) loop
    v_id := (c->>'id')::uuid;
    skrg := null; v_nama := null;
    select jsonb_build_object('name', name, 'company', company, 'title', title, 'email', email, 'phone', phone,
                              'participant_type', participant_type, 'rsvp_status', rsvp_status, 'extra', extra), name
      into skrg, v_nama
      from public.participants where id = v_id and event_id = p_event_id;

    if skrg is null then
      n_tetap := n_tetap + 1;
      tetap := tetap || jsonb_build_array(jsonb_build_object('name', c->'after'->>'name', 'reason', 'removed'));
    elsif skrg is distinct from c->'after' then
      n_tetap := n_tetap + 1;
      tetap := tetap || jsonb_build_array(jsonb_build_object('name', v_nama, 'reason', 'changed'));
    elsif c->'before' is null or jsonb_typeof(c->'before') = 'null' then
      if v_id = any (terpakai) then
        n_tetap := n_tetap + 1;
        tetap := tetap || jsonb_build_array(jsonb_build_object('name', v_nama, 'reason', 'has_records'));
      else
        n_hapus := n_hapus + 1;
        if not p_dry_run then
          delete from public.participants where id = v_id and event_id = p_event_id;
        end if;
      end if;
    else
      n_pulih := n_pulih + 1;
      if not p_dry_run then
        update public.participants
           set name = c->'before'->>'name',
               company = c->'before'->>'company',
               title = c->'before'->>'title',
               email = c->'before'->>'email',
               phone = c->'before'->>'phone',
               participant_type = c->'before'->>'participant_type',
               rsvp_status = c->'before'->>'rsvp_status',
               extra = case when jsonb_typeof(c->'before'->'extra') = 'object' then c->'before'->'extra' else null end
         where id = v_id and event_id = p_event_id;
      end if;
    end if;
  end loop;

  hasil := jsonb_build_object(
    'dry_run', p_dry_run, 'removed', n_hapus, 'restored', n_pulih, 'kept', n_tetap,
    'kept_list', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(tetap) x limit 50) s),
    'kept_truncated', n_tetap > 50
  );

  if not p_dry_run then
    update public.participant_imports
       set undone_at = now(), undone_by = p_actor, undo_result = hasil - 'kept_list' - 'dry_run'
     where id = imp.id;
    insert into public.audit_logs (event_id, user_id, action, payload)
    values (p_event_id, p_actor, 'participants_import_undone',
            jsonb_build_object('import_id', imp.id, 'file_name', imp.file_name,
                               'removed', n_hapus, 'restored', n_pulih, 'kept', n_tetap));
  end if;
  return hasil;
end $$;

revoke all on function public.undo_participant_import(uuid, bigint, boolean, uuid) from public, anon, authenticated;
grant execute on function public.undo_participant_import(uuid, bigint, boolean, uuid) to service_role;

commit;

notify pgrst, 'reload schema';
