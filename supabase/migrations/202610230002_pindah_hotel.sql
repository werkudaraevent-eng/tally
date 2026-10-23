-- ============================================================================
-- Pindah hotel di tengah acara (Logistics > Stays).
-- Disetujui Hanung 2026-10-23: sebagian peserta KSO menginap di GRAMM 5-6 Nov
-- lalu pindah ke RAY 6-8 Nov.
--
-- Satu penempatan (lodging_assignments) kini satu "stay": hotel, kamar
-- (boleh menyusul), dan malam menginap. Peserta boleh punya beberapa stay,
-- satu per hotel:
--
--   peserta A, hotel GRAMM, kamar 1208, 5 Nov 14.00 -> 6 Nov 12.00
--   peserta A, hotel RAY,   kamar null, 6 Nov 14.00 -> 8 Nov 12.00
--
-- Tanggal null tetap berarti "ikut tanggal kamar, lalu hotel", jadi peserta
-- dengan satu stay berubah 0 px. Malam antar-stay tidak boleh bertabrakan;
-- itu dijaga fungsi-fungsi di bawah (satu-satunya jalan menulis tabel ini).
--
-- Fungsi:
--   assign_room     kamar di hotel yang sudah ada stay-nya mengisi stay itu
--                   (tanggal dan stay lain tetap); hotel baru = ganti semua
--                   stay seperti sebelumnya
--   assign_hotel    "All nights": ganti semua stay dengan satu stay hotel ini
--   set_stay        BARU, "Only some nights": stay hotel ini pada malam
--                   tertentu; stay lain yang bertabrakan dipotong atau dihapus
--   release_room    BARU: lepas kamar, hotel dan tanggal tetap
--   unassign_room   + p_hotel_id: lepas satu stay, atau semua bila null
--   member_logistics  + "stays" berurutan; "lodging" = stay yang sedang atau
--                   akan berjalan
-- Semuanya SECURITY DEFINER dan hanya untuk service_role.
--
-- Satu transaksi, aman dijalankan ulang. Kode PR ini membutuhkan migrasi ini:
-- jalankan dulu, baru merge. Kode lama tetap jalan sesudah migrasi ini
-- (belum ada peserta dengan dua stay sampai kode baru dipakai).
-- ============================================================================

begin;

set local lock_timeout = '5s';

-- 1. Satu stay per peserta per hotel (sebelumnya satu per peserta).
alter table public.lodging_assignments
  drop constraint if exists lodging_assignments_participant_unique,
  drop constraint if exists lodging_assignments_participant_hotel_unique;
alter table public.lodging_assignments
  add constraint lodging_assignments_participant_hotel_unique unique (event_id, participant_id, hotel_id);

alter table public.lodging_assignments
  drop constraint if exists lodging_assignments_dates_check;
alter table public.lodging_assignments
  add constraint lodging_assignments_dates_check
    check (check_in_at is null or check_out_at is null or check_out_at > check_in_at);

-- 2. assign_room: badan 202610230001.
--    Peserta sudah punya stay di hotel kamar ini: kamarnya diisi, tanggal
--    dan stay lain tetap (mengisi kamar RAY tidak menghapus malam GRAMM).
--    Belum: semua stay diganti stay kamar ini, seperti sebelumnya.
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
  stay_ada boolean;
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

  select true, room_id into stay_ada, kamar_lama from public.lodging_assignments
   where event_id = p_event_id and participant_id = p_participant_id and hotel_id = kamar.hotel_id;
  stay_ada := coalesce(stay_ada, false);

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

  if stay_ada then
    update public.lodging_assignments
       set room_id = p_room_id,
           check_in_at = coalesce(p_check_in_at, check_in_at),
           check_out_at = coalesce(p_check_out_at, check_out_at),
           created_at = now(),
           created_by = p_actor
     where event_id = p_event_id and participant_id = p_participant_id and hotel_id = kamar.hotel_id;
  else
    delete from public.lodging_assignments
     where event_id = p_event_id and participant_id = p_participant_id;
    insert into public.lodging_assignments (event_id, hotel_id, room_id, participant_id, check_in_at, check_out_at, created_by)
    values (p_event_id, kamar.hotel_id, p_room_id, p_participant_id, p_check_in_at, p_check_out_at, p_actor);
  end if;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'lodging_assigned', jsonb_build_object(
    'participant_id', p_participant_id, 'room_id', p_room_id, 'room_number', kamar.room_number,
    'hotel_id', kamar.hotel_id, 'previous_room_id', kamar_lama));

  return jsonb_build_object('room_id', p_room_id, 'previous_room_id', kamar_lama);
end $$;

revoke all on function public.assign_room(uuid, bigint, uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.assign_room(uuid, bigint, uuid, uuid, timestamptz, timestamptz) to service_role;

-- 3. assign_hotel ("All nights"): badan 202610230001. Semua stay peserta
--    diganti satu stay di hotel ini tanpa kamar, ikut tanggal hotel.
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
           'previous', (select coalesce(jsonb_agg(jsonb_build_object('hotel_id', a.hotel_id, 'room_id', a.room_id)), '[]'::jsonb)
                          from public.lodging_assignments a
                         where a.event_id = p_event_id and a.participant_id = x))
    from unnest(ids) as x;

  delete from public.lodging_assignments
   where event_id = p_event_id and participant_id = any(ids) and hotel_id <> p_hotel_id;

  insert into public.lodging_assignments (event_id, hotel_id, room_id, participant_id, created_by)
  select p_event_id, p_hotel_id, null, x, p_actor from unnest(ids) as x
  on conflict (event_id, participant_id, hotel_id) do update
    set room_id = null,
        check_in_at = null,
        check_out_at = null,
        created_at = now(),
        created_by = excluded.created_by;
  get diagnostics jumlah = row_count;
  return jumlah;
end $$;

revoke all on function public.assign_hotel(uuid, bigint, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.assign_hotel(uuid, bigint, uuid[], uuid) to service_role;

-- 4. set_stay ("Only some nights"): stay hotel ini dari p_check_in_at sampai
--    p_check_out_at. Kamar di hotel ini tetap bila sudah ada. Stay lain yang
--    malamnya bertabrakan (tanggal efektif: stay, lalu kamar, lalu hotel;
--    null = tanpa batas):
--      mulai lebih awal  -> dipotong, berakhir saat stay ini mulai
--      berakhir lebih lambat -> dipotong, mulai saat stay ini berakhir
--      seluruhnya di dalam -> dihapus
--    p_trim false: tanpa memotong (impor Excel, yang sudah memastikan malam
--    antar-baris tidak bertabrakan dan melepas hotel lain lebih dulu; memotong
--    di tengah impor bisa menghapus stay yang tanggalnya baru diganti sesudahnya).
--    Semua atau tidak sama sekali.
drop function if exists public.set_stay(uuid, bigint, uuid[], timestamptz, timestamptz, uuid);
create or replace function public.set_stay(
  p_event_id uuid,
  p_hotel_id bigint,
  p_participant_ids uuid[],
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_actor uuid default null,
  p_trim boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
  jumlah int;
  zona text;
begin
  if not exists (select 1 from public.lodging_hotels where id = p_hotel_id and event_id = p_event_id) then
    raise exception 'HOTEL_NOT_FOUND';
  end if;
  select time_zone into zona from public.events where id = p_event_id;

  if p_check_in_at is null or p_check_out_at is null or p_check_out_at <= p_check_in_at then
    raise exception 'LODGING_DATES_INVALID';
  end if;

  select coalesce(array_agg(distinct x), '{}') into ids from unnest(p_participant_ids) as x where x is not null;
  if cardinality(ids) = 0 then
    return 0;
  end if;

  if (select count(*) from public.participants
       where id = any(ids) and event_id = p_event_id and source_removed_at is null) <> cardinality(ids) then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  create temp table if not exists set_stay_lain (id bigint, masuk timestamptz, keluar timestamptz) on commit drop;
  truncate set_stay_lain;
  insert into set_stay_lain
  select a.id,
         coalesce(a.check_in_at, r.check_in_at, h.check_in_at),
         coalesce(a.check_out_at, r.check_out_at, h.check_out_at)
    from public.lodging_assignments a
    join public.lodging_hotels h on h.id = a.hotel_id
    left join public.lodging_rooms r on r.id = a.room_id
   where a.event_id = p_event_id
     and a.participant_id = any(ids)
     and a.hotel_id <> p_hotel_id;
  delete from set_stay_lain
   where not p_trim
      or not ((masuk is null or masuk < p_check_out_at) and (keluar is null or keluar > p_check_in_at));

  insert into public.audit_logs (event_id, user_id, action, payload)
  select p_event_id, p_actor, 'lodging_stay_set', jsonb_build_object(
           'participant_id', x, 'hotel_id', p_hotel_id,
           'check_in_at', p_check_in_at, 'check_out_at', p_check_out_at,
           'trimmed', (select coalesce(jsonb_agg(jsonb_build_object('hotel_id', a.hotel_id, 'room_id', a.room_id,
                                                                    'check_in_at', l.masuk, 'check_out_at', l.keluar)), '[]'::jsonb)
                         from set_stay_lain l join public.lodging_assignments a on a.id = l.id
                        where a.participant_id = x))
    from unnest(ids) as x;

  -- Potongan memakai jam stay lama pada tanggal stay baru (check-out 12.00
  -- hari pindah, bukan jam check-in hotel baru), selama tidak bertabrakan.
  -- Stay lama tanpa jam check-out (hotel belum punya tanggal): 12.00.
  update public.lodging_assignments a
     set check_out_at = case
           when (((p_check_in_at at time zone zona)::date + coalesce((l.keluar at time zone zona)::time, time '12:00')) at time zone zona) <= p_check_in_at
           then ((p_check_in_at at time zone zona)::date + coalesce((l.keluar at time zone zona)::time, time '12:00')) at time zone zona
           else p_check_in_at end
    from set_stay_lain l
   where a.id = l.id and (l.masuk is null or l.masuk < p_check_in_at);

  update public.lodging_assignments a
     set check_in_at = case
           when l.masuk is not null
            and (((p_check_out_at at time zone zona)::date + (l.masuk at time zone zona)::time) at time zone zona) >= p_check_out_at
           then ((p_check_out_at at time zone zona)::date + (l.masuk at time zone zona)::time) at time zone zona
           else p_check_out_at end
    from set_stay_lain l
   where a.id = l.id and not (l.masuk is null or l.masuk < p_check_in_at)
     and (l.keluar is null or l.keluar > p_check_out_at);

  delete from public.lodging_assignments a
   using set_stay_lain l
   where a.id = l.id and not (l.masuk is null or l.masuk < p_check_in_at)
     and not (l.keluar is null or l.keluar > p_check_out_at);

  insert into public.lodging_assignments (event_id, hotel_id, room_id, participant_id, check_in_at, check_out_at, created_by)
  select p_event_id, p_hotel_id, null, x, p_check_in_at, p_check_out_at, p_actor from unnest(ids) as x
  on conflict (event_id, participant_id, hotel_id) do update
    set check_in_at = excluded.check_in_at,
        check_out_at = excluded.check_out_at,
        created_at = now(),
        created_by = excluded.created_by;
  get diagnostics jumlah = row_count;
  return jumlah;
end $$;

revoke all on function public.set_stay(uuid, bigint, uuid[], timestamptz, timestamptz, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_stay(uuid, bigint, uuid[], timestamptz, timestamptz, uuid, boolean) to service_role;

-- 5. release_room: lepas kamar, hotel dan tanggal stay tetap (Rooms > hapus
--    penghuni). Sebelumnya lewat assign_hotel, yang kini mengganti semua stay.
create or replace function public.release_room(
  p_event_id uuid,
  p_room_id bigint,
  p_participant_ids uuid[],
  p_actor uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  jumlah int;
begin
  insert into public.audit_logs (event_id, user_id, action, payload)
  select p_event_id, p_actor, 'lodging_room_released', jsonb_build_object(
           'participant_id', a.participant_id, 'hotel_id', a.hotel_id, 'room_id', a.room_id)
    from public.lodging_assignments a
   where a.event_id = p_event_id and a.room_id = p_room_id and a.participant_id = any(p_participant_ids);

  update public.lodging_assignments
     set room_id = null
   where event_id = p_event_id and room_id = p_room_id and participant_id = any(p_participant_ids);
  get diagnostics jumlah = row_count;
  return jumlah;
end $$;

revoke all on function public.release_room(uuid, bigint, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.release_room(uuid, bigint, uuid[], uuid) to service_role;

-- 6. unassign_room: badan 202610230001 + p_hotel_id. Null = lepas semua stay
--    (seperti sebelumnya), terisi = lepas stay di hotel itu saja.
drop function if exists public.unassign_room(uuid, uuid, uuid);
create or replace function public.unassign_room(
  p_event_id uuid,
  p_participant_id uuid,
  p_actor uuid default null,
  p_hotel_id bigint default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  lepas jsonb;
begin
  with hapus as (
    delete from public.lodging_assignments
     where event_id = p_event_id and participant_id = p_participant_id
       and (p_hotel_id is null or hotel_id = p_hotel_id)
    returning hotel_id, room_id
  )
  select jsonb_agg(jsonb_build_object('hotel_id', hotel_id, 'room_id', room_id)) into lepas from hapus;

  if lepas is null then
    return false;
  end if;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'lodging_unassigned', jsonb_build_object(
    'participant_id', p_participant_id, 'stays', lepas));
  return true;
end $$;

revoke all on function public.unassign_room(uuid, uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.unassign_room(uuid, uuid, uuid, bigint) to service_role;

-- 7. member_logistics: badan 202610230001. "stays" = semua stay berurutan
--    tanggal; "lodging" = stay yang sedang berjalan, atau yang berikutnya,
--    atau yang terakhir bila semuanya lewat. Satu stay = sama seperti dulu.
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
  semua_stay jsonb;
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

  with tinggal as (
    select a.id, h.name, h.address, h.map_url, r.id as kamar_id, r.room_number, r.room_type, r.floor,
           coalesce(a.check_in_at, r.check_in_at, h.check_in_at) as masuk,
           coalesce(a.check_out_at, r.check_out_at, h.check_out_at) as keluar
      from public.lodging_assignments a
      join public.lodging_hotels h on h.id = a.hotel_id
      left join public.lodging_rooms r on r.id = a.room_id
     where a.event_id = p_event_id and a.participant_id = p_participant_id
  ), isi as (
    select t.keluar,
           row_number() over (order by t.masuk nulls first, t.id) as urut,
           jsonb_build_object(
             'hotel', jsonb_build_object('name', t.name, 'address', t.address, 'map_url', t.map_url),
             -- Null = hotel sudah, nomor kamar menyusul.
             'room_number', t.room_number,
             'room_type', t.room_type,
             'floor', t.floor,
             'check_in_at', t.masuk,
             'check_out_at', t.keluar,
             -- Teman sekamar hanya ada bila kamarnya sudah ada.
             'roommates', case when tampil_teman and t.kamar_id is not null then (
               select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'company', p.company)
                                         order by p.name), '[]'::jsonb)
                 from public.lodging_assignments a2
                 join public.participants p on p.id = a2.participant_id
                where a2.room_id = t.kamar_id
                  and a2.participant_id <> p_participant_id
                  and p.source_removed_at is null
             ) end) as j
      from tinggal t
  )
  select coalesce(jsonb_agg(j order by urut), '[]'::jsonb),
         coalesce((select i.j from isi i where i.keluar is null or i.keluar > now() order by i.urut limit 1),
                  (select i.j from isi i order by i.urut desc limit 1))
    into semua_stay, kamar
    from isi;

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
    'stays', semua_stay,
    'transport', case when bus_bawaan is null and agenda = '[]'::jsonb then null
                      else jsonb_build_object('default_bus', bus_bawaan, 'trips', agenda) end,
    'items', barang);
end $$;

revoke all on function public.member_logistics(uuid, uuid) from public, anon, authenticated;
grant execute on function public.member_logistics(uuid, uuid) to service_role;
notify pgrst, 'reload schema';

commit;
