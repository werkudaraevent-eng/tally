-- ============================================================================
-- Perjalanan bus dari Agenda (Logistics > Buses > Trips > Agenda row).
--
-- Satu perjalanan boleh ditautkan ke satu baris Agenda (rundown_items), dan
-- satu baris boleh dipakai beberapa perjalanan (pulang ke dua tujuan). Dialog
-- New/Edit trip memakai tautan itu untuk mengisi nama dan jam berangkat, dan
-- Jadwal portal menaruh bus peserta di baris yang tepat lewat id, bukan lewat
-- jam yang kebetulan sama (Batch 1 dan Batch 2 berjalan pada jam yang sama).
--
-- Jam berangkat tetap milik perjalanan, karena bus bisa berangkat sebelum
-- acaranya. Bila jam atau tanggal barisnya berubah, depart_at perjalanan yang
-- tertaut bergeser sejauh yang sama (seperti Travel Time di Apple Calendar).
-- Selisihnya dihitung dari jam dinding: ketiga zona acara tanpa DST (CHECK
-- events.time_zone), dan pergeseran hari dihitung n x 24 jam, bukan
-- make_interval(days), supaya tidak bergantung pada zona sesi penulis.
--
-- Baris dihapus (langsung, ikut bagiannya, atau lewat delete_event): tautannya
-- dikosongkan dan perjalanan tetap dengan jam terakhirnya. HARUS
-- `set null (rundown_item_id)`: set null biasa pada FK komposit ikut
-- mengosongkan event_id dan gagal 23502 (lihat 202608180001). Perlu Postgres 15+.
--
-- copy_logistics_config (duplikasi acara) sengaja tidak menyalin tautan:
-- baris Agenda acara salinan ber-id baru.
--
-- member_logistics: badan 202609300005 ditambah dua kunci per perjalanan,
-- `id` dan `rundown_item_id`. Tidak ada perubahan lain.
--
-- Acara yang ada tidak berubah: belum ada perjalanan yang tertaut.
-- ============================================================================

begin;

set local lock_timeout = '5s';

do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'Perlu Postgres 15+ untuk ON DELETE SET NULL (kolom)';
  end if;
  if not exists (
    select 1 from pg_proc
     where oid = 'public.member_logistics(uuid, uuid)'::regprocedure
       and (md5(replace(prosrc, E'\r', '')) = '4e39e7cf45d0daa9a30815cfa7e3471d'
            or position('''rundown_item_id'', t.rundown_item_id' in prosrc) > 0)
  ) then
    raise exception 'member_logistics berbeda dari repo (202609300005); bandingkan dulu';
  end if;
end $$;

-- 1. Kunci komposit di rundown_items (rundown_sections sudah punya, 202608070002).
alter table public.transport_trips drop constraint if exists transport_trips_rundown_item_same_event;
alter table public.rundown_items drop constraint if exists rundown_items_event_id_unique;
alter table public.rundown_items add constraint rundown_items_event_id_unique unique (event_id, id);

-- 2. Tautan. integer: rundown_items.id adalah serial.
alter table public.transport_trips add column if not exists rundown_item_id integer;

alter table public.transport_trips
  add constraint transport_trips_rundown_item_same_event
  foreign key (event_id, rundown_item_id) references public.rundown_items (event_id, id)
  on delete set null (rundown_item_id);

create index if not exists transport_trips_rundown_item_idx
  on public.transport_trips (event_id, rundown_item_id) where rundown_item_id is not null;

comment on column public.transport_trips.rundown_item_id is
  'Baris Agenda perjalanan ini (Logistics > Trips). Null = tidak ditautkan. Jam atau tanggal barisnya berubah: depart_at ikut bergeser sejauh yang sama.';

-- 3. Jam berangkat bergeser bersama barisnya: jam mulai berubah, atau baris
--    dipindah ke bagian bertanggal lain.
create or replace function public.transport_trips_follow_agenda_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  geser interval := new.start_time - old.start_time;
begin
  if new.section_id is distinct from old.section_id then
    geser := geser + ((select event_date from public.rundown_sections where id = new.section_id)
                      - (select event_date from public.rundown_sections where id = old.section_id)) * interval '24 hours';
  end if;
  if geser is null or geser = interval '0' then
    return null;
  end if;
  update public.transport_trips
     set depart_at = depart_at + geser,
         updated_at = now()
   where event_id = new.event_id
     and rundown_item_id = new.id
     and depart_at is not null;
  return null;
end $$;

drop trigger if exists rundown_items_move_linked_trips on public.rundown_items;
create trigger rundown_items_move_linked_trips
  after update of start_time, section_id on public.rundown_items
  for each row
  when (old.start_time is distinct from new.start_time or old.section_id is distinct from new.section_id)
  execute function public.transport_trips_follow_agenda_item();

-- Tanggal bagian berubah (juga lewat Event details > geser agenda): semua
-- perjalanan yang tertaut ke baris bagian itu bergeser sejumlah hari yang sama.
create or replace function public.transport_trips_follow_agenda_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.transport_trips t
     set depart_at = t.depart_at + (new.event_date - old.event_date) * interval '24 hours',
         updated_at = now()
    from public.rundown_items i
   where i.event_id = new.event_id
     and i.section_id = new.id
     and t.event_id = i.event_id
     and t.rundown_item_id = i.id
     and t.depart_at is not null;
  return null;
end $$;

drop trigger if exists rundown_sections_move_linked_trips on public.rundown_sections;
create trigger rundown_sections_move_linked_trips
  after update of event_date on public.rundown_sections
  for each row
  when (old.event_date is distinct from new.event_date)
  execute function public.transport_trips_follow_agenda_day();

revoke all on function public.transport_trips_follow_agenda_item() from public, anon, authenticated;
revoke all on function public.transport_trips_follow_agenda_day() from public, anon, authenticated;

-- 4. member_logistics: badan 202609300005, ditambah `id` dan `rundown_item_id`
--    di tiap perjalanan.
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
           'room_number', r.room_number,
           'room_type', r.room_type,
           'floor', r.floor,
           'check_in_at', coalesce(a.check_in_at, r.check_in_at, h.check_in_at),
           'check_out_at', coalesce(a.check_out_at, r.check_out_at, h.check_out_at),
           'roommates', case when tampil_teman then (
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
    join public.lodging_rooms r on r.id = a.room_id
    join public.lodging_hotels h on h.id = r.hotel_id
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
