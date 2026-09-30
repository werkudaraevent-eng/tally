-- ---------------------------------------------------------------------------
-- Logistik peserta (1/4): kamar hotel dan teman sekamar.
--
-- Rancangan lengkap: tasks/logistik-peserta-plan.md.
--
-- Teman sekamar TIDAK disimpan. Ia diturunkan dari siapa pun yang ditempatkan
-- di kamar yang sama. Menyimpannya dua kali (A sekamar B, B sekamar A) pasti
-- suatu saat tidak cocok, dan peserta akan melihat nama yang salah.
--
-- Teman sekamar harus sesama jenis kelamin (keputusan panitia, 30 Sep 2026).
-- `participants` tidak punya kolom jenis kelamin, dan tidak perlu punya:
-- jawabannya sudah bisa dikumpulkan lewat field formulir pendaftaran, dan
-- tersimpan di `participants.extra` untuk ketiga jalur masuk peserta
-- (pendaftaran, tambah manual, impor). Panitia cukup menyebut key field mana
-- yang berisi jenis kelamin di `lodging_settings`. Kolom baru di `participants`
-- berarti mengubah sinkron Scanner, `save_participant`, dan
-- `import_participants` sekaligus, untuk data yang jalurnya sudah ada.
--
-- Akses hanya lewat service role, sama seperti tabel lain.
-- ---------------------------------------------------------------------------

create table if not exists public.lodging_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  -- Key di `participants.extra` yang berisi jenis kelamin, mis. "jenis_kelamin".
  gender_field_key text,
  -- Mati hanya untuk acara yang memang tidak memisahkan kamar (keluarga,
  -- kamar tunggal semua). Bawaannya menyala.
  enforce_same_gender boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

create table if not exists public.lodging_hotels (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  address text,
  map_url text,
  -- Bawaan untuk kamar-kamarnya; bisa ditimpa per kamar dan per peserta.
  check_in_at timestamptz,
  check_out_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lodging_hotels_event_id_unique unique (event_id, id)
);

create table if not exists public.lodging_rooms (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  hotel_id bigint not null,
  -- Teks, bukan angka: "1208", "1208A", "Villa 3".
  room_number text not null,
  room_type text,
  capacity smallint not null default 2 check (capacity between 1 and 20),
  floor text,
  check_in_at timestamptz,
  check_out_at timestamptz,
  -- Hanya untuk panitia, tidak pernah dikirim ke area peserta.
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lodging_rooms_event_id_unique unique (event_id, id),
  constraint lodging_rooms_number_unique unique (event_id, hotel_id, room_number),
  foreign key (event_id, hotel_id) references public.lodging_hotels(event_id, id) on delete cascade
);

create table if not exists public.lodging_assignments (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  room_id bigint not null,
  participant_id uuid not null,
  -- Null = pakai tanggal kamar, lalu hotel.
  check_in_at timestamptz,
  check_out_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  -- Satu kamar per peserta per acara.
  constraint lodging_assignments_participant_unique unique (event_id, participant_id),
  foreign key (event_id, room_id) references public.lodging_rooms(event_id, id) on delete cascade,
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete cascade
);

create index if not exists lodging_assignments_room_idx on public.lodging_assignments (room_id);

alter table public.lodging_settings enable row level security;
alter table public.lodging_hotels enable row level security;
alter table public.lodging_rooms enable row level security;
alter table public.lodging_assignments enable row level security;
revoke all on table public.lodging_settings from public, anon, authenticated;
revoke all on table public.lodging_hotels from public, anon, authenticated;
revoke all on table public.lodging_rooms from public, anon, authenticated;
revoke all on table public.lodging_assignments from public, anon, authenticated;

-- Jenis kelamin yang dibandingkan: huruf kecil, tanpa spasi tepi. "Pria" dan
-- "pria " dari dua jalur masuk yang berbeda harus dianggap sama.
create or replace function public.lodging_gender_of(p_extra jsonb, p_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(lower(btrim(coalesce(p_extra ->> p_key, ''))), '')
$$;

revoke all on function public.lodging_gender_of(jsonb, text) from public, anon, authenticated;
grant execute on function public.lodging_gender_of(jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- Tempatkan atau pindahkan satu peserta ke kamar.
--
-- Kapasitas dan jenis kelamin dijaga di sini, dengan kamar tujuan dikunci:
-- dua admin yang mengisi bersamaan tidak boleh menaruh tiga orang di kamar
-- twin, atau pria dan wanita di kamar yang sama. Pemeriksaan di formulir saja
-- tidak cukup untuk dua jendela yang terbuka bersamaan.
--
-- Peserta yang sudah dihapus di sumber (`source_removed_at`) tidak dihitung
-- sebagai penghuni: penempatannya tetap ada untuk riwayat, tetapi tempatnya
-- sudah boleh diisi orang lain.
-- ---------------------------------------------------------------------------
create or replace function public.assign_room(
  p_event_id uuid,
  p_room_id bigint,
  p_participant_id uuid,
  p_actor uuid default null,
  p_check_in_at timestamptz default null,
  p_check_out_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  kamar public.lodging_rooms;
  peserta public.participants;
  aturan public.lodging_settings;
  gender_peserta text;
  penghuni int;
  beda int;
  kamar_lama bigint;
begin
  select * into kamar from public.lodging_rooms
   where id = p_room_id and event_id = p_event_id
   for update;
  if kamar.id is null then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into peserta from public.participants
   where id = p_participant_id and event_id = p_event_id and source_removed_at is null;
  if peserta.id is null then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  if p_check_in_at is not null and p_check_out_at is not null and p_check_out_at <= p_check_in_at then
    raise exception 'LODGING_DATES_INVALID';
  end if;

  select room_id into kamar_lama from public.lodging_assignments
   where event_id = p_event_id and participant_id = p_participant_id;

  if kamar_lama is distinct from p_room_id then
    select count(*) into penghuni
      from public.lodging_assignments a
      join public.participants p on p.id = a.participant_id
     where a.room_id = p_room_id and p.source_removed_at is null;
    if penghuni >= kamar.capacity then
      raise exception using message = 'ROOM_FULL',
        detail = format('%s dari %s tempat terisi', penghuni, kamar.capacity);
    end if;
  end if;

  select * into aturan from public.lodging_settings where event_id = p_event_id;
  if coalesce(aturan.enforce_same_gender, true) then
    if aturan.gender_field_key is null then
      raise exception using message = 'LODGING_GENDER_FIELD_NOT_SET',
        hint = 'Pilih field jenis kelamin di pengaturan Kamar, atau matikan aturan sesama jenis kelamin.';
    end if;
    gender_peserta := public.lodging_gender_of(peserta.extra, aturan.gender_field_key);
    if gender_peserta is null then
      raise exception 'PARTICIPANT_GENDER_UNKNOWN';
    end if;
    select count(*) into beda
      from public.lodging_assignments a
      join public.participants p on p.id = a.participant_id
     where a.room_id = p_room_id
       and a.participant_id <> p_participant_id
       and p.source_removed_at is null
       and public.lodging_gender_of(p.extra, aturan.gender_field_key) is distinct from gender_peserta;
    if beda > 0 then
      raise exception 'ROOM_GENDER_MISMATCH';
    end if;
  end if;

  insert into public.lodging_assignments (event_id, room_id, participant_id, check_in_at, check_out_at, created_by)
  values (p_event_id, p_room_id, p_participant_id, p_check_in_at, p_check_out_at, p_actor)
  on conflict (event_id, participant_id) do update
    set room_id = excluded.room_id,
        check_in_at = excluded.check_in_at,
        check_out_at = excluded.check_out_at,
        created_at = now(),
        created_by = excluded.created_by;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'lodging_assigned', jsonb_build_object(
    'participant_id', p_participant_id, 'room_id', p_room_id, 'room_number', kamar.room_number,
    'previous_room_id', kamar_lama));

  return jsonb_build_object('room_id', p_room_id, 'previous_room_id', kamar_lama);
end $$;

revoke all on function public.assign_room(uuid, bigint, uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.assign_room(uuid, bigint, uuid, uuid, timestamptz, timestamptz) to service_role;

create or replace function public.unassign_room(
  p_event_id uuid,
  p_participant_id uuid,
  p_actor uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  kamar_lama bigint;
begin
  delete from public.lodging_assignments
   where event_id = p_event_id and participant_id = p_participant_id
  returning room_id into kamar_lama;

  if kamar_lama is null then
    return false;
  end if;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'lodging_unassigned', jsonb_build_object(
    'participant_id', p_participant_id, 'room_id', kamar_lama));
  return true;
end $$;

revoke all on function public.unassign_room(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.unassign_room(uuid, uuid, uuid) to service_role;
