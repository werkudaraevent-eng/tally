-- ============================================================================
-- Peran kustom, langkah 2 dari 2 (Users & roles > Roles).
--
-- access_roles: peran buatan pemilik sistem. `permissions` berbentuk
--
--   { "modules": { "dashboard": "view", "participants": "manage", ... },
--     "participants_download": true, "messages_send_email": false }
--
-- Modul yang tidak disebut = tanpa akses. Kunci dan tingkatnya diperiksa di
-- aplikasi (src/lib/auth/izin-modul.ts), bukan di sini: daftar modul ikut
-- bertambah tanpa migrasi baru.
--
-- users.access_role_id: peran yang dipakai akun berperan `custom`. Satu akun
-- satu peran, sama seperti users.role; akses per acara tetap lewat
-- user_event_access. Peran yang masih dipakai tidak bisa dihapus (restrict).
--
-- generate_registration_qr dibuka untuk service_role: peserta yang ditambah
-- akun kustom mendapat QR dari server, karena akun itu tidak boleh melihat
-- atau mengetik QR.
--
-- save_participant: jejak participant_updated kini membawa `new` di samping
-- `old`, supaya Audit trail bisa menampilkan field mana yang diubah klien
-- (sebelumnya hanya isi lama). Isi fungsi lainnya SAMA PERSIS dengan
-- 202609050001_participant_extra_sync.sql.
--
-- Tabel baru, kolom baru, satu grant, satu fungsi diganti. Tanpa ubahan data. Satu transaksi, aman
-- dijalankan ulang. Kode yang memakainya merge SETELAH ini dijalankan.
-- ============================================================================

begin;
set local lock_timeout = '5s';

create table if not exists public.access_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  constraint access_roles_name_check check (char_length(btrim(name)) between 1 and 60),
  constraint access_roles_permissions_check check (jsonb_typeof(permissions) = 'object')
);

create unique index if not exists access_roles_name_unique on public.access_roles (lower(btrim(name)));

comment on table public.access_roles is
  'Peran kustom buatan super admin: izin No access / View / Manage per modul admin. Dipakai akun berperan custom lewat users.access_role_id.';

alter table public.access_roles enable row level security;
revoke all on table public.access_roles from public, anon, authenticated;

alter table public.users
  add column if not exists access_role_id uuid references public.access_roles(id) on delete restrict;

alter table public.users drop constraint if exists users_custom_role_check;
alter table public.users
  add constraint users_custom_role_check
  check ((role = 'custom') = (access_role_id is not null));

create index if not exists users_access_role_idx on public.users (access_role_id) where access_role_id is not null;

comment on column public.users.access_role_id is
  'Peran kustom akun ini. Wajib terisi tepat ketika role = custom.';

grant execute on function public.generate_registration_qr(uuid) to service_role;

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
                             'old', case when p_id is null then null else to_jsonb(lama) end,
                             'new', case when p_id is null then null else to_jsonb(baru) end));

  return baru;
end $$;

-- SECURITY DEFINER: hanya server (service_role) yang memanggilnya.
revoke all on function public.save_participant(uuid, uuid, text, text, text, text, text, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_participant(uuid, uuid, text, text, text, text, text, text, text, text, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
