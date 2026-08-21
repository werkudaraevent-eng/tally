-- ---------------------------------------------------------------------------
-- Tautan permanen ke kode peserta.
--
-- Sebelum ini, kode peserta hanya hidup di dua tempat: layar sukses yang tampil
-- sekali, dan email yang belum tentu terkirim. Pendaftar yang menutup halaman
-- sebelum sempat memotretnya kehilangan kodenya sama sekali, dan satu-satunya
-- pemulihan adalah menghubungi panitia yang harus membuka database.
--
-- Token ini memberi setiap pendaftaran satu alamat yang bisa dibuka lagi:
-- /e/<slug>/kode/<token>. Dengan begitu "potret layar ini sekarang, halaman ini
-- tidak bisa dibuka lagi" berhenti menjadi kalimat yang harus dipercaya.
--
-- KENAPA DUA UUID, BUKAN gen_random_bytes: `gen_random_bytes` hidup di ekstensi
-- pgcrypto, yang skema pemasangannya berbeda antar proyek Supabase dan pernah
-- berpindah. `gen_random_uuid()` adalah fungsi inti PostgreSQL 13+, selalu ada,
-- dan dua di antaranya memberi 256 bit — jauh di atas yang dibutuhkan untuk
-- membuat penebakan tidak masuk akal.
--
-- Token BUKAN rahasia sekelas kata sandi: yang dilindunginya adalah satu kode
-- masuk acara, dan siapa pun yang dikirimi tautannya memang dimaksudkan
-- membukanya. Karena itu tidak ada masa berlaku, dan halamannya tidak meminta
-- verifikasi apa pun.
-- ---------------------------------------------------------------------------

alter table public.event_registrations
  add column if not exists access_token text;

-- Baris lama ikut mendapat token. Tanpa ini, pendaftaran yang sudah ada tidak
-- punya halaman kode dan panitia tetap harus membuka database untuk mereka.
update public.event_registrations
   set access_token = replace(gen_random_uuid()::text, '-', '') ||
                      replace(gen_random_uuid()::text, '-', '')
 where access_token is null;

alter table public.event_registrations
  alter column access_token set default (
    replace(gen_random_uuid()::text, '-', '') ||
    replace(gen_random_uuid()::text, '-', '')
  );

alter table public.event_registrations
  alter column access_token set not null;

-- Unik: token dipakai sebagai satu-satunya kunci pencarian di halaman publik,
-- dan tabrakan berarti satu pendaftar melihat kode pendaftar lain.
create unique index if not exists event_registrations_access_token_key
  on public.event_registrations (access_token);

-- ---------------------------------------------------------------------------
-- submit_event_registration mengembalikan tokennya.
--
-- Ditulis ulang seutuhnya, bukan ditambal: fungsi ini `create or replace`, dan
-- versi di 202608200001 tetap menjadi rujukan bila migrasi dijalankan dari nol.
-- Satu-satunya perubahan di sini adalah `access_token` yang ikut dikembalikan.
-- ---------------------------------------------------------------------------
create or replace function public.submit_event_registration(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_company text default null,
  p_job_title text default null,
  p_extra jsonb default '{}'::jsonb,
  p_ip text default null,
  p_upload_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events;
  reg_id uuid;
  reg_token text;
  peserta_id uuid;
  kode text;
begin
  select * into ev from public.events where id = p_event_id;
  if ev.id is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if not ev.registration_enabled then
    raise exception 'REGISTRATION_CLOSED';
  end if;
  if ev.status not in ('draft', 'active') then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  insert into public.event_registrations
    (event_id, name, email, phone, company, job_title, extra, submitted_ip)
  values
    (p_event_id, btrim(p_name),
     nullif(lower(btrim(coalesce(p_email, ''))), ''),
     nullif(btrim(coalesce(p_phone, '')), ''),
     nullif(btrim(coalesce(p_company, '')), ''), nullif(btrim(coalesce(p_job_title, '')), ''),
     coalesce(p_extra, '{}'::jsonb), p_ip)
  returning id, access_token into reg_id, reg_token;

  if array_length(p_upload_ids, 1) is not null then
    update public.registration_uploads
       set registration_id = reg_id
     where id = any (p_upload_ids)
       and event_id = p_event_id
       and registration_id is null;
  end if;

  if not ev.registration_auto_approve then
    insert into public.audit_logs (event_id, action, payload)
    values (p_event_id, 'registration_submitted',
            jsonb_build_object('registration_id', reg_id, 'auto_approved', false));
    return jsonb_build_object(
      'registration_id', reg_id, 'status', 'pending', 'qr_code', null,
      'access_token', reg_token);
  end if;

  kode := public.generate_registration_qr(p_event_id);
  insert into public.participants (event_id, qr_code, name, company, title, email, phone, extra)
  values (p_event_id, kode, btrim(p_name),
          nullif(btrim(coalesce(p_company, '')), ''),
          nullif(btrim(coalesce(p_job_title, '')), ''),
          nullif(lower(btrim(coalesce(p_email, ''))), ''),
          nullif(btrim(coalesce(p_phone, '')), ''),
          coalesce(p_extra, '{}'::jsonb))
  returning id into peserta_id;

  update public.event_registrations
     set status = 'approved', participant_id = peserta_id, reviewed_at = now()
   where id = reg_id;

  insert into public.audit_logs (event_id, action, payload)
  values (p_event_id, 'registration_submitted',
          jsonb_build_object('registration_id', reg_id, 'auto_approved', true,
                             'participant_id', peserta_id, 'qr_code', kode));

  return jsonb_build_object(
    'registration_id', reg_id, 'status', 'approved', 'qr_code', kode,
    'access_token', reg_token);
end $$;

revoke all on function public.submit_event_registration(uuid, text, text, text, text, text, jsonb, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.submit_event_registration(uuid, text, text, text, text, text, jsonb, text, uuid[])
  to service_role;
