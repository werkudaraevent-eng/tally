-- Impor tamu undangan juga melewati email yang SEDANG MENUNGGU persetujuan
-- pendaftaran di acara ini (temuan QA M3 pada tambah tamu manual).
--
-- Sebelumnya hanya peserta aktif yang dilewati. Orang yang sudah mendaftar
-- sendiri dan masih menunggu disetujui tetap bisa diundang, lalu menerima
-- email "silakan mendaftar" padahal pendaftarannya sudah masuk. Pendaftaran
-- yang disetujui sudah tercakup lewat peserta aktif; yang disetujui lalu
-- pesertanya dihapus, dan yang ditolak, tetap boleh diundang ulang.
--
-- Hanya isi fungsi yang berubah: tanda tangan, hak akses, dan kunci hasil
-- (already_participant) sama, jadi kode aplikasi tidak perlu diubah dan
-- migrasi ini aman dijalankan sebelum atau sesudah deploy. Pencarian memakai
-- event_registrations_email_unique (event_id, lower(email)) where status <> 'rejected'.
--
-- Catatan (sudah ada sebelumnya, di luar migrasi ini): mengubah email tamu
-- lewat PATCH belum memeriksa peserta atau pendaftar yang menunggu.

-- Bila berhenti karena lock_timeout, jalankan ulang: berkas ini aman dijalankan
-- dua kali.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.import_event_invitations(
  p_event_id uuid,
  p_rows jsonb,
  p_dry_run boolean,
  p_actor uuid,
  p_test boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_ada public.event_invitations;
  v_tekan text;
  v_email text;
  v_nama text;
  v_baris integer := 0;
  v_baru integer := 0;
  v_gabung integer := 0;
  v_peserta integer := 0;
  v_tanpa_email integer := 0;
  v_tekanan integer := 0;
  v_mirip integer := 0;
  v_contoh_peserta jsonb := '[]'::jsonb;
  v_contoh_mirip jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'IMPORT_TOO_LARGE';
  end if;

  begin
    for r in
      select x.* from jsonb_to_recordset(p_rows) as x(
        "row" integer, name text, email text, company text, title text, phone text, email_hash text)
       order by x."row"
    loop
      v_baris := v_baris + 1;
      v_email := nullif(lower(btrim(r.email)), '');
      v_nama := left(btrim(coalesce(r.name, '')), 120);
      if v_nama = '' then
        raise exception 'IMPORT_NAME_REQUIRED';
      end if;
      if v_email is not null and coalesce(char_length(r.email_hash), 0) < 20 then
        raise exception 'IMPORT_HASH_REQUIRED';
      end if;

      if v_email is null then
        v_tanpa_email := v_tanpa_email + 1;
        if exists (
          select 1 from public.event_invitations
           where event_id = p_event_id and deleted_at is null and email_norm is null
             and lower(btrim(name)) = lower(v_nama)
        ) then
          v_mirip := v_mirip + 1;
          if jsonb_array_length(v_contoh_mirip) < 20 then
            v_contoh_mirip := v_contoh_mirip || jsonb_build_object('row', r."row", 'name', v_nama);
          end if;
        end if;
        insert into public.event_invitations
          (event_id, name, company, title, phone, is_test, attested_by, attested_at, created_by)
        values (p_event_id, v_nama, nullif(left(btrim(r.company), 160), ''), nullif(left(btrim(r.title), 160), ''),
                nullif(left(btrim(r.phone), 30), ''), p_test, p_actor, now(), p_actor);
        continue;
      end if;

      if exists (
        select 1 from public.participants
         where event_id = p_event_id and source_removed_at is null
           and lower(btrim(email)) = v_email
      ) or exists (
        select 1 from public.event_registrations
         where event_id = p_event_id and status = 'pending'
           and lower(email) = v_email
      ) then
        v_peserta := v_peserta + 1;
        if jsonb_array_length(v_contoh_peserta) < 20 then
          v_contoh_peserta := v_contoh_peserta || jsonb_build_object('row', r."row", 'name', v_nama, 'email', v_email);
        end if;
        continue;
      end if;

      select * into v_ada from public.event_invitations
       where event_id = p_event_id and email_norm = v_email and deleted_at is null;
      if v_ada.id is not null then
        v_gabung := v_gabung + 1;
        update public.event_invitations
           set company = coalesce(company, nullif(left(btrim(r.company), 160), '')),
               title = coalesce(title, nullif(left(btrim(r.title), 160), '')),
               phone = coalesce(phone, nullif(left(btrim(r.phone), 30), '')),
               updated_at = now()
         where id = v_ada.id;
        continue;
      end if;

      select reason into v_tekan from public.event_email_suppressions
       where event_id = p_event_id and email_hash = r.email_hash;
      if v_tekan is not null then
        v_tekanan := v_tekanan + 1;
      end if;

      insert into public.event_invitations
        (event_id, name, email, company, title, phone, opted_out_at, email_invalid_at,
         is_test, attested_by, attested_at, created_by)
      values (p_event_id, v_nama, v_email, nullif(left(btrim(r.company), 160), ''), nullif(left(btrim(r.title), 160), ''),
              nullif(left(btrim(r.phone), 30), ''),
              case when v_tekan in ('berhenti', 'spam') then now() end,
              case when v_tekan = 'memantul' then now() end,
              p_test, p_actor, now(), p_actor);
      v_baru := v_baru + 1;
    end loop;

    if p_dry_run then
      raise exception 'IMPORT_DRY_RUN';
    end if;
  exception when raise_exception then
    if sqlerrm <> 'IMPORT_DRY_RUN' then
      raise;
    end if;
  end;

  if not p_dry_run then
    insert into public.audit_logs (event_id, user_id, action, payload)
    values (p_event_id, p_actor, 'invitations_import',
            jsonb_build_object('rows', v_baris, 'inserted', v_baru + v_tanpa_email,
                               'merged', v_gabung, 'participants', v_peserta, 'test', p_test));
  end if;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'rows', v_baris,
    'inserted', v_baru + v_tanpa_email,
    'with_email', v_baru,
    'merged', v_gabung,
    'already_participant', v_peserta,
    'without_email', v_tanpa_email,
    'suppressed', v_tekanan,
    'possible_duplicates', v_mirip,
    'participant_samples', v_contoh_peserta,
    'duplicate_samples', v_contoh_mirip);
end;
$$;

revoke all on function public.import_event_invitations(uuid, jsonb, boolean, uuid, boolean) from public, anon, authenticated;
grant execute on function public.import_event_invitations(uuid, jsonb, boolean, uuid, boolean) to service_role;

commit;
