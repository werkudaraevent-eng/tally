-- ============================================================================
-- Hotel dulu, nomor kamar menyusul (Logistics > Assign to hotel).
-- Disetujui Hanung 2026-10-23: rooming list dari hotel biasanya datang mepet,
-- padahal peserta sudah perlu tahu hotelnya (kartu Kamar, Rute, Agenda > Who
-- sees it per hotel).
--
-- lodging_assignments mendapat hotel_id (wajib) dan room_id menjadi opsional:
--
--   hotel_id 12, room_id 301    tamu GRAMM di kamar 301 (seperti sebelumnya)
--   hotel_id 12, room_id null   tamu GRAMM, nomor kamar menyusul
--
-- Kamar harus milik hotel yang sama. Itu dijaga FK komposit
-- (event_id, hotel_id, room_id) ke lodging_rooms (event_id, hotel_id, id):
-- dengan MATCH SIMPLE, baris tanpa kamar tidak diperiksa, dan baris berkamar
-- harus menunjuk kamar di hotel itu. ON UPDATE CASCADE: kamar yang dipindah ke
-- hotel lain (dialog Edit room) ikut memindahkan hotel penghuninya.
--
-- Baris lama diisi hotel_id dari kamarnya, jadi setiap acara yang sudah ada
-- berubah 0 px. Aturan jenis kelamin dan kapasitas tetap di assign_room: tamu
-- tanpa kamar belum punya teman sekamar.
--
-- Fungsi:
--   assign_room     sama, kini juga menulis hotel_id dari kamarnya
--   assign_hotel    BARU: tempatkan di hotel tanpa kamar (atau lepas kamarnya)
--   unassign_room   sama, kini juga mengenali tamu tanpa kamar
--   member_logistics  kartu Kamar membaca hotel dari penempatan, kamar opsional
-- Semuanya SECURITY DEFINER dan hanya untuk service_role.
--
-- Satu transaksi, aman dijalankan ulang. Kode PR ini membutuhkan migrasi ini:
-- jalankan dulu, baru merge.
-- ============================================================================

begin;

set local lock_timeout = '5s';

-- 1. Kolom hotel_id, diisi dari kamar, lalu wajib.
alter table public.lodging_assignments
  add column if not exists hotel_id bigint;

update public.lodging_assignments a
   set hotel_id = r.hotel_id
  from public.lodging_rooms r
 where r.id = a.room_id
   and a.hotel_id is distinct from r.hotel_id;

alter table public.lodging_assignments
  alter column hotel_id set not null,
  alter column room_id drop not null;

-- 2. Hotel harus milik acara yang sama; kamar (bila ada) milik hotel itu.
--    Dilepas dulu lalu dibuat lagi supaya aman dijalankan ulang (FK
--    bergantung pada unique di lodging_rooms).
alter table public.lodging_assignments
  drop constraint if exists lodging_assignments_hotel_fkey,
  drop constraint if exists lodging_assignments_room_in_hotel_fkey;

alter table public.lodging_rooms
  drop constraint if exists lodging_rooms_hotel_room_unique;
alter table public.lodging_rooms
  add constraint lodging_rooms_hotel_room_unique unique (event_id, hotel_id, id);

alter table public.lodging_assignments
  add constraint lodging_assignments_hotel_fkey
    foreign key (event_id, hotel_id) references public.lodging_hotels(event_id, id) on delete cascade,
  add constraint lodging_assignments_room_in_hotel_fkey
    foreign key (event_id, hotel_id, room_id) references public.lodging_rooms(event_id, hotel_id, id)
    on update cascade on delete cascade;

create index if not exists lodging_assignments_hotel_idx on public.lodging_assignments (hotel_id);

-- 3. assign_room: badan 202609300002, ditambah hotel_id.
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

  insert into public.lodging_assignments (event_id, hotel_id, room_id, participant_id, check_in_at, check_out_at, created_by)
  values (p_event_id, kamar.hotel_id, p_room_id, p_participant_id, p_check_in_at, p_check_out_at, p_actor)
  on conflict (event_id, participant_id) do update
    set hotel_id = excluded.hotel_id,
        room_id = excluded.room_id,
        check_in_at = excluded.check_in_at,
        check_out_at = excluded.check_out_at,
        created_at = now(),
        created_by = excluded.created_by;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'lodging_assigned', jsonb_build_object(
    'participant_id', p_participant_id, 'room_id', p_room_id, 'room_number', kamar.room_number,
    'hotel_id', kamar.hotel_id, 'previous_room_id', kamar_lama));

  return jsonb_build_object('room_id', p_room_id, 'previous_room_id', kamar_lama);
end $$;

revoke all on function public.assign_room(uuid, bigint, uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.assign_room(uuid, bigint, uuid, uuid, timestamptz, timestamptz) to service_role;

-- 4. assign_hotel: tamu hotel tanpa kamar, banyak orang sekaligus dalam satu
--    transaksi (rombongan 200+ orang; satu RPC per orang terlalu lama untuk
--    satu permintaan). Dipakai juga untuk melepas kamar tanpa melepas
--    hotelnya. Tanpa aturan kapasitas atau jenis kelamin: keduanya milik
--    kamar, dan diperiksa saat kamarnya dipilih.
--    Tanggal per orang dipertahankan bila hotelnya sama, dikosongkan bila
--    pindah hotel (tanggal hotel lama tidak berlaku di hotel baru).
--    Semua atau tidak sama sekali: satu peserta yang tidak ditemukan
--    membatalkan seluruh panggilan.
create or replace function public.assign_hotel(
  p_event_id uuid,
  p_hotel_id bigint,
  p_participant_ids uuid[],
  p_actor uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
  jumlah int;
begin
  if not exists (select 1 from public.lodging_hotels where id = p_hotel_id and event_id = p_event_id) then
    raise exception 'HOTEL_NOT_FOUND';
  end if;

  select coalesce(array_agg(distinct x), '{}') into ids from unnest(p_participant_ids) as x where x is not null;
  if cardinality(ids) = 0 then
    return 0;
  end if;

  if (select count(*) from public.participants
       where id = any(ids) and event_id = p_event_id and source_removed_at is null) <> cardinality(ids) then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  insert into public.audit_logs (event_id, user_id, action, payload)
  select p_event_id, p_actor, 'lodging_hotel_assigned', jsonb_build_object(
           'participant_id', x, 'hotel_id', p_hotel_id,
           'previous_hotel_id', a.hotel_id, 'previous_room_id', a.room_id)
    from unnest(ids) as x
    left join public.lodging_assignments a on a.event_id = p_event_id and a.participant_id = x;

  insert into public.lodging_assignments (event_id, hotel_id, room_id, participant_id, created_by)
  select p_event_id, p_hotel_id, null, x, p_actor from unnest(ids) as x
  on conflict (event_id, participant_id) do update
    set hotel_id = excluded.hotel_id,
        room_id = null,
        check_in_at = case when lodging_assignments.hotel_id = excluded.hotel_id then lodging_assignments.check_in_at end,
        check_out_at = case when lodging_assignments.hotel_id = excluded.hotel_id then lodging_assignments.check_out_at end,
        created_at = now(),
        created_by = excluded.created_by;
  get diagnostics jumlah = row_count;
  return jumlah;
end $$;

revoke all on function public.assign_hotel(uuid, bigint, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.assign_hotel(uuid, bigint, uuid[], uuid) to service_role;

-- 5. unassign_room: badan 202609300002. Tamu tanpa kamar (room_id null) juga
--    dilepas dan dilaporkan true.
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
  hotel_lama bigint;
  kamar_lama bigint;
begin
  delete from public.lodging_assignments
   where event_id = p_event_id and participant_id = p_participant_id
  returning hotel_id, room_id into hotel_lama, kamar_lama;

  if hotel_lama is null then
    return false;
  end if;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'lodging_unassigned', jsonb_build_object(
    'participant_id', p_participant_id, 'room_id', kamar_lama, 'hotel_id', hotel_lama));
  return true;
end $$;

revoke all on function public.unassign_room(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.unassign_room(uuid, uuid, uuid) to service_role;

-- 6. member_logistics: badan 202610170002. Hotel dibaca dari penempatan,
--    kamar lewat left join; tanpa kamar = room_number null, tanpa teman sekamar.
create or replace function public.member_logistics(p_event_id uuid, p_participant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tampil_teman boolean;
  kamar jsonb;
  bus_bawaan text;
  agenda jsonb;
  barang jsonb;
begin
  if not exists (
    select 1 from public.participants
     where id = p_participant_id and event_id = p_event_id and source_removed_at is null
  ) then
    return null;
  end if;

  select coalesce((landing_config -> 'member' ->> 'show_roommates')::boolean, true)
    into tampil_teman
    from public.events where id = p_event_id;

  select jsonb_build_object(
           'hotel', jsonb_build_object('name', h.name, 'address', h.address, 'map_url', h.map_url),
           -- Null = hotel sudah, nomor kamar menyusul.
           'room_number', r.room_number,
           'room_type', r.room_type,
           'floor', r.floor,
           'check_in_at', coalesce(a.check_in_at, r.check_in_at, h.check_in_at),
           'check_out_at', coalesce(a.check_out_at, r.check_out_at, h.check_out_at),
           -- Teman sekamar hanya ada bila kamarnya sudah ada: tamu hotel yang
           -- sama-sama menunggu kamar bukan teman sekamar.
           'roommates', case when tampil_teman and r.id is not null then (
             select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'company', p.company)
                                       order by p.name), '[]'::jsonb)
               from public.lodging_assignments a2
               join public.participants p on p.id = a2.participant_id
              where a2.room_id = r.id
                and a2.participant_id <> p_participant_id
                and p.source_removed_at is null
           ) end)
    into kamar
    from public.lodging_assignments a
    join public.lodging_hotels h on h.id = a.hotel_id
    left join public.lodging_rooms r on r.id = a.room_id
   where a.event_id = p_event_id and a.participant_id = p_participant_id;

  select v.code into bus_bawaan
    from public.transport_assignments a
    join public.transport_vehicles v on v.id = a.vehicle_id
   where a.event_id = p_event_id and a.trip_id is null and a.participant_id = p_participant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'name', t.name,
           'depart_at', t.depart_at,
           'origin', t.origin,
           'destination', t.destination,
           'meeting_point', t.meeting_point,
           -- Baris Agenda tempat perjalanan ini ditautkan. Null = tidak ditautkan.
           'rundown_item_id', t.rundown_item_id,
           'bus', v.code,
           -- Beri tahu peserta bila bus di agenda ini berbeda dari biasanya.
           'differs_from_default', v.code is distinct from bus_bawaan
         ) order by t.sort_order, t.depart_at nulls last, t.id), '[]'::jsonb)
    into agenda
    from public.transport_effective(p_event_id) e
    join public.transport_trips t on t.id = e.trip_id
    left join public.transport_vehicles v on v.id = e.vehicle_id
   where e.participant_id = p_participant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', i.name,
           'size', case when i.size_field_key is not null
                        then coalesce(k.size, nullif(btrim(p.extra ->> i.size_field_key), '')) end,
           'pickup_note', i.pickup_note,
           'picked_up_at', k.picked_up_at
         ) order by i.sort_order, i.id), '[]'::jsonb)
    into barang
    from public.pickup_items i
    join public.participants p on p.id = p_participant_id
    left join public.item_pickups k on k.item_id = i.id and k.participant_id = p.id
   where i.event_id = p_event_id;

  return jsonb_build_object(
    'lodging', kamar,
    'transport', case when bus_bawaan is null and agenda = '[]'::jsonb then null
                      else jsonb_build_object('default_bus', bus_bawaan, 'trips', agenda) end,
    'items', barang);
end $$;

revoke all on function public.member_logistics(uuid, uuid) from public, anon, authenticated;
grant execute on function public.member_logistics(uuid, uuid) to service_role;
notify pgrst, 'reload schema';

commit;
