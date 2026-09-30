-- ---------------------------------------------------------------------------
-- Logistik peserta (4/4): area peserta, dan duplikasi acara.
--
-- Rancangan lengkap: tasks/logistik-peserta-plan.md.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Satu panggilan untuk area peserta.
--
-- Hanya yang boleh dilihat peserta: tanpa catatan kamar, kontak kru bus, atau
-- pelat nomor. Teman sekamar hanya nama dan perusahaan, tidak email atau
-- telepon.
--
-- Teman sekamar tampil secara bawaan dan bisa disembunyikan per acara lewat
-- `landing_config.member.show_roommates = false` (keputusan panitia, 30 Sep
-- 2026). Dibaca DI SINI, bukan di route: data yang disembunyikan tidak boleh
-- pernah keluar dari database, supaya satu route yang lupa memeriksa tidak
-- membocorkannya.
-- ---------------------------------------------------------------------------
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
           'name', t.name,
           'depart_at', t.depart_at,
           'origin', t.origin,
           'destination', t.destination,
           'meeting_point', t.meeting_point,
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

-- ---------------------------------------------------------------------------
-- 2. Duplikasi acara membawa konfigurasi logistik.
--
-- Yang disalin: pengaturan kamar, hotel, kamar, bus, agenda bus, dan item.
-- Yang TIDAK: penempatan dan catatan pengambilan, sama seperti peserta tidak
-- ikut disalin. Waktu (check-in, keberangkatan) digeser sejauh selisih tanggal
-- acara, supaya salinan tahun depan tidak menampilkan jam tahun ini.
--
-- Hubungan item ke sesi scan tidak disalin karena sesi scan sendiri tidak
-- ikut diduplikasi.
-- ---------------------------------------------------------------------------
create or replace function public.copy_logistics_config(
  p_source_event_id uuid,
  p_target_event_id uuid,
  p_shift interval default interval '0'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  geser interval := coalesce(p_shift, interval '0');
  hotel record;
  hotel_baru bigint;
  n_hotel int := 0;
  n_kamar int := 0;
  n_bus int;
  n_agenda int;
  n_item int;
begin
  insert into public.lodging_settings (event_id, gender_field_key, enforce_same_gender)
  select p_target_event_id, gender_field_key, enforce_same_gender
    from public.lodging_settings where event_id = p_source_event_id
  on conflict (event_id) do nothing;

  for hotel in
    select * from public.lodging_hotels where event_id = p_source_event_id order by id
  loop
    insert into public.lodging_hotels (event_id, name, address, map_url, check_in_at, check_out_at, sort_order)
    values (p_target_event_id, hotel.name, hotel.address, hotel.map_url,
            hotel.check_in_at + geser, hotel.check_out_at + geser, hotel.sort_order)
    returning id into hotel_baru;
    n_hotel := n_hotel + 1;

    insert into public.lodging_rooms (event_id, hotel_id, room_number, room_type, capacity, floor,
                                      check_in_at, check_out_at, notes)
    select p_target_event_id, hotel_baru, room_number, room_type, capacity, floor,
           check_in_at + geser, check_out_at + geser, notes
      from public.lodging_rooms where hotel_id = hotel.id;
    n_kamar := n_kamar + (select count(*) from public.lodging_rooms where hotel_id = hotel.id);
  end loop;

  insert into public.transport_vehicles (event_id, code, capacity, plate_number, crew_contact, sort_order)
  select p_target_event_id, code, capacity, plate_number, crew_contact, sort_order
    from public.transport_vehicles where event_id = p_source_event_id;
  get diagnostics n_bus = row_count;

  insert into public.transport_trips (event_id, name, depart_at, origin, destination, meeting_point,
                                      follows_default, sort_order)
  select p_target_event_id, name, depart_at + geser, origin, destination, meeting_point,
         follows_default, sort_order
    from public.transport_trips where event_id = p_source_event_id;
  get diagnostics n_agenda = row_count;

  insert into public.pickup_items (event_id, name, size_field_key, pickup_note, sort_order)
  select p_target_event_id, name, size_field_key, pickup_note, sort_order
    from public.pickup_items where event_id = p_source_event_id;
  get diagnostics n_item = row_count;

  return jsonb_build_object('hotel', n_hotel, 'kamar', n_kamar, 'bus', n_bus,
                            'agenda_bus', n_agenda, 'item', n_item);
end $$;

revoke all on function public.copy_logistics_config(uuid, uuid, interval) from public, anon, authenticated;
grant execute on function public.copy_logistics_config(uuid, uuid, interval) to service_role;

-- Disisipkan ke `duplicate_event` lewat penggantian teks, pola yang sama dengan
-- 202608200002: fungsi itu panjang, dan menyalinnya utuh ke sini membuat dua
-- versi yang harus dijaga tetap sama. Jumlah yang disalin ikut masuk ke
-- payload audit `event_duplicate`.
do $$
declare
  sumber_def text;
  jangkar text := 'insert into public.audit_logs (event_id, user_id, action, payload)';
begin
  select pg_get_functiondef(p.oid) into sumber_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'duplicate_event'
  limit 1;

  if sumber_def is null then
    raise notice 'duplicate_event tidak ditemukan; lewati penyalinan logistik.';
    return;
  end if;

  if position('copy_logistics_config' in sumber_def) > 0 then
    return;
  end if;

  if position(jangkar in sumber_def) = 0 then
    raise exception 'duplicate_event berubah bentuk: titik sisip logistik tidak ditemukan';
  end if;

  sumber_def := replace(sumber_def, jangkar,
    'jumlah := jumlah || jsonb_build_object(''logistik'', public.copy_logistics_config('
    || 'p_source_event_id, baru.id, make_interval(days => coalesce(baru.event_date - sumber.event_date, 0))));'
    || E'\n\n  ' || jangkar);
  execute sumber_def;
end $$;
