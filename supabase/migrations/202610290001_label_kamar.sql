-- ============================================================================
-- Label kamar dan jenis kasur (Logistics > Rooms, impor rooming list).
-- Disetujui Hanung 2026-10-29: rooming list panitia per kamar berisi label
-- panitia ("Kamar 01"), TIPE (Twin/King), JENIS KAMAR (Deluxe), ROOM NUMBER
-- yang sering baru diisi hotel belakangan, dan dua nama penghuni.
--
--   label        BARU: kode kamar milik panitia, hanya untuk admin. Mengelompokkan
--                teman sekamar sebelum hotel membagi nomor. Unik per hotel.
--   bed_type     BARU: jenis kasur (Twin, King). room_type tetap jenis kamar
--                (Deluxe). Dua kolom terpisah, satu fakta per kolom.
--   room_number  kini boleh kosong selama label terisi: nomor kamar menyusul.
--                Peserta melihat "Nomor kamar menyusul" dan teman sekamarnya.
--
-- Fungsi:
--   lodging_cek_kamar     pesan ROOM_FULL memakai label bila nomor kosong
--   member_logistics      + bed_type
--   copy_logistics_config + label, bed_type (duplikasi acara)
-- Semuanya SECURITY DEFINER dan hanya untuk service_role.
--
-- Satu transaksi, aman dijalankan ulang. Kode lama tetap jalan sesudah
-- migrasi ini: semua kamar yang ada punya nomor, dan kode lama tidak pernah
-- membuat kamar tanpa nomor.
-- ============================================================================

begin;

set local lock_timeout = '5s';

-- 1. Kolom baru dan nomor kamar opsional.
alter table public.lodging_rooms add column if not exists label text;
alter table public.lodging_rooms add column if not exists bed_type text;
alter table public.lodging_rooms alter column room_number drop not null;

alter table public.lodging_rooms drop constraint if exists lodging_rooms_label_check;
alter table public.lodging_rooms
  add constraint lodging_rooms_label_check check (label is null or (char_length(label) between 1 and 40 and label = btrim(label)));
alter table public.lodging_rooms drop constraint if exists lodging_rooms_bed_type_check;
alter table public.lodging_rooms
  add constraint lodging_rooms_bed_type_check check (bed_type is null or char_length(bed_type) between 1 and 40);
-- Kamar dikenali lewat nomornya, labelnya, atau keduanya.
alter table public.lodging_rooms drop constraint if exists lodging_rooms_number_or_label;
alter table public.lodging_rooms
  add constraint lodging_rooms_number_or_label check (room_number is not null or label is not null);
alter table public.lodging_rooms drop constraint if exists lodging_rooms_label_unique;
alter table public.lodging_rooms
  add constraint lodging_rooms_label_unique unique (event_id, hotel_id, label);

-- 2. Pemeriksaan kamar: badan 202610280001, nama kamar = nomor atau label.
create or replace function public.lodging_cek_kamar(p_event_id uuid, p_room_ids bigint[], p_participant_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  aturan public.lodging_settings;
  penuh record;
  tanpa_gender uuid;
begin
  if cardinality(coalesce(p_room_ids, '{}')) = 0 then
    return;
  end if;

  -- Kunci kamar tujuan (urut id, sesudah kunci peserta di pemanggilnya).
  -- Panggilan lain ke kamar yang sama menunggu di sini, lalu pernyataan
  -- berikutnya membaca penghuni yang sudah di-commit: dua orang tidak bisa
  -- sama-sama mengambil tempat terakhir.
  perform 1 from public.lodging_rooms
   where id = any(p_room_ids) and event_id = p_event_id
   order by id
   for update;

  create temp table if not exists lodging_cek_huni (
    room_id bigint, participant_id uuid, rentang tstzrange, gender text
  ) on commit drop;
  create index if not exists lodging_cek_huni_kamar on lodging_cek_huni (room_id);
  truncate lodging_cek_huni;

  select * into aturan from public.lodging_settings where event_id = p_event_id;

  insert into lodging_cek_huni
  select a.room_id, a.participant_id,
         public.lodging_rentang(coalesce(a.check_in_at, r.check_in_at, h.check_in_at),
                                coalesce(a.check_out_at, r.check_out_at, h.check_out_at)),
         case when aturan.gender_field_key is not null
              then public.lodging_gender_of(p.extra, aturan.gender_field_key) end
    from public.lodging_assignments a
    join public.lodging_rooms r on r.id = a.room_id
    join public.lodging_hotels h on h.id = a.hotel_id
    join public.participants p on p.id = a.participant_id
   where a.event_id = p_event_id
     and a.room_id = any(p_room_ids)
     and p.source_removed_at is null;
  analyze lodging_cek_huni;

  -- Hanya malam stay yang baru ditulis: kamar yang sudah kelebihan karena
  -- kapasitasnya diturunkan tidak menghalangi perubahan di malam lain.
  select coalesce(r.room_number, r.label) as room_number, r.capacity, x.jumlah into penuh
    from (
      select s.room_id, max((select count(*) from lodging_cek_huni t
                              where t.room_id = s.room_id and t.rentang @> p.titik)) as jumlah
        from lodging_cek_huni s
        cross join lateral (
          select lower(s.rentang) as titik
          union
          select lower(u.rentang) from lodging_cek_huni u
           where u.room_id = s.room_id and not isempty(u.rentang) and s.rentang @> lower(u.rentang)
        ) p
       where not isempty(s.rentang)
         and s.participant_id = any(p_participant_ids)
       group by s.room_id
    ) x
    join public.lodging_rooms r on r.id = x.room_id
   where x.jumlah > r.capacity
   order by coalesce(r.room_number, r.label)
   limit 1;
  if found then
    raise exception using message = 'ROOM_FULL',
      detail = format('Room %s: %s of %s places taken', penuh.room_number, penuh.jumlah, penuh.capacity);
  end if;

  if coalesce(aturan.enforce_same_gender, true) then
    if aturan.gender_field_key is null then
      raise exception using message = 'LODGING_GENDER_FIELD_NOT_SET',
        hint = 'Pilih field jenis kelamin di pengaturan Kamar, atau matikan aturan sesama jenis kelamin.';
    end if;
    select participant_id into tanpa_gender from lodging_cek_huni
     where participant_id = any(p_participant_ids) and gender is null limit 1;
    if tanpa_gender is not null then
      raise exception 'PARTICIPANT_GENDER_UNKNOWN';
    end if;
    if exists (
      select 1 from lodging_cek_huni s
        join lodging_cek_huni t on t.room_id = s.room_id and t.participant_id <> s.participant_id
       where s.participant_id = any(p_participant_ids)
         and s.rentang && t.rentang
         and t.gender is distinct from s.gender
    ) then
      raise exception 'ROOM_GENDER_MISMATCH';
    end if;
  end if;
end $$;

revoke all on function public.lodging_cek_kamar(uuid, bigint[], uuid[]) from public, anon, authenticated;
grant execute on function public.lodging_cek_kamar(uuid, bigint[], uuid[]) to service_role;

-- 3. member_logistics: badan 202610280001 + bed_type.
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
    select a.id, h.name, h.address, h.map_url, r.id as kamar_id, r.room_number, r.room_type, r.bed_type, r.floor,
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
             -- Null = nomor kamar menyusul (hotel saja, atau kamar berlabel tanpa nomor).
             'room_number', t.room_number,
             'room_type', t.room_type,
             -- Twin, King: dari kolom Bed di Logistics. Label kamar tidak pernah dikirim.
             'bed_type', t.bed_type,
             'floor', t.floor,
             'check_in_at', t.masuk,
             'check_out_at', t.keluar,
             -- Teman sekamar hanya ada bila kamarnya sudah ada, dan hanya
             -- yang berbagi malam dengan stay ini.
             'roommates', case when tampil_teman and t.kamar_id is not null then (
               select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'company', p.company)
                                         order by p.name), '[]'::jsonb)
                 from public.lodging_assignments a2
                 join public.participants p on p.id = a2.participant_id
                 join public.lodging_rooms r2 on r2.id = a2.room_id
                 join public.lodging_hotels h2 on h2.id = a2.hotel_id
                where a2.room_id = t.kamar_id
                  and a2.participant_id <> p_participant_id
                  and p.source_removed_at is null
                  and public.lodging_rentang(coalesce(a2.check_in_at, r2.check_in_at, h2.check_in_at),
                                             coalesce(a2.check_out_at, r2.check_out_at, h2.check_out_at))
                      && public.lodging_rentang(t.masuk, t.keluar)
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

-- 4. copy_logistics_config: badan 202609300005 + label, bed_type.
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

    insert into public.lodging_rooms (event_id, hotel_id, room_number, label, room_type, bed_type, capacity, floor,
                                      check_in_at, check_out_at, notes)
    select p_target_event_id, hotel_baru, room_number, label, room_type, bed_type, capacity, floor,
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

notify pgrst, 'reload schema';

commit;
