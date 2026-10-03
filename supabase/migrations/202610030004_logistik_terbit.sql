-- ---------------------------------------------------------------------------
-- Logistik untuk acara gathering: menu Logistik, terbit bertahap, dan jadwal
-- bus per baris rundown.
--
-- Disetujui Hanung 2026-10-03 ("ok gathering"). Rancangan:
-- /mnt/project-files/gathering/rekomendasi.md.
--
-- Kenapa terbit bertahap, bukan langsung tayang: menukar dua orang di antara
-- dua kamar yang penuh butuh langkah perantara karena kapasitas dijaga. Kalau
-- setiap langkah langsung terlihat, di tengah jalan peserta melihat kamar
-- kosong atau teman sekamar yang salah. Panitia menyunting salinan kerja
-- (lodging_assignments, transport_assignments); peserta membaca salinan terbit.
--
-- Pengambilan barang TIDAK ikut ditahap: dicatat saat scan di meja, dan
-- peserta perlu melihat "sudah diambil" saat itu juga.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Setelan per acara.
--
-- Disimpan di lodging_settings, bukan landing_config.member: Simpan di Area
-- peserta mengganti seluruh `member`, jadi kunci yang tidak dikenalnya hilang.
-- `logistics_enabled` menampilkan menu Logistik di acara yang belum punya
-- data apa pun (preset Gathering menyalakannya).
-- ---------------------------------------------------------------------------
alter table public.lodging_settings
  add column if not exists logistics_enabled boolean not null default false,
  add column if not exists publish_rooms boolean not null default false,
  add column if not exists publish_transport boolean not null default false,
  add column if not exists publish_items boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Agenda bus boleh menunjuk satu baris rundown, supaya Dashboard saya bisa
-- menaruh bus di baris jadwal yang tepat alih-alih menebak dari jam.
-- ---------------------------------------------------------------------------
alter table public.transport_trips
  add column if not exists rundown_item_id int references public.rundown_items(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. Salinan terbit.
--
-- Hanya pemetaan orang ke kamar dan ke bus yang dibekukan. Nama hotel, nomor
-- kamar, jam berangkat, dan titik kumpul tetap dibaca langsung: membetulkan
-- salah ketik tidak perlu menunggu terbit.
--
-- Bus dibekukan dalam bentuk efektifnya (hasil transport_effective ditambah
-- bus bawaan), supaya agenda baru atau agenda yang diubah mengikuti bus
-- bawaan juga baru terlihat setelah terbit.
-- ---------------------------------------------------------------------------
create table if not exists public.logistics_published_lodging (
  event_id       uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  room_id        bigint not null references public.lodging_rooms(id) on delete cascade,
  check_in_at    timestamptz,
  check_out_at   timestamptz,
  primary key (event_id, participant_id)
);

create table if not exists public.logistics_published_transport (
  event_id       uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  -- 0 = bus bawaan. Bukan null, supaya bisa ikut kunci utama.
  trip_key       bigint not null default 0,
  -- null = "tidak naik bus" di agenda itu (override tanpa bus).
  vehicle_id     bigint references public.transport_vehicles(id) on delete cascade,
  primary key (event_id, participant_id, trip_key)
);

-- Catatan tiap terbit. `changed_participant_ids` adalah penerima "Beri tahu
-- peserta" di Pesan peserta (audience jenis manual).
create table if not exists public.logistics_publish_log (
  id                      bigint generated always as identity primary key,
  event_id                uuid not null references public.events(id) on delete cascade,
  published_at            timestamptz not null default now(),
  published_by            uuid references public.users(id) on delete set null,
  publish_rooms           boolean not null,
  publish_transport       boolean not null,
  publish_items           boolean not null,
  changed_participant_ids uuid[] not null default '{}',
  rooms_changed           int not null default 0,
  buses_changed           int not null default 0
);

create index if not exists logistics_publish_log_event_idx
  on public.logistics_publish_log (event_id, published_at desc);

alter table public.logistics_published_lodging enable row level security;
alter table public.logistics_published_transport enable row level security;
alter table public.logistics_publish_log enable row level security;
revoke all on public.logistics_published_lodging, public.logistics_published_transport,
              public.logistics_publish_log from anon, authenticated;

-- Bentuk kerja bus yang sama dengan salinan terbit: satu baris per peserta
-- per agenda, plus trip_key 0 untuk bus bawaan.
create or replace function public.logistics_working_transport(p_event_id uuid)
returns table (participant_id uuid, trip_key bigint, vehicle_id bigint)
language sql
stable
set search_path = public
as $$
  select a.participant_id, 0::bigint, a.vehicle_id
    from public.transport_assignments a
    join public.participants p on p.id = a.participant_id and p.source_removed_at is null
   where a.event_id = p_event_id and a.trip_id is null and a.vehicle_id is not null
  union all
  -- Termasuk override "tidak naik bus" (vehicle_id null), supaya peserta
  -- melihat agenda itu tanpa bus, bukan agendanya hilang.
  select e.participant_id, e.trip_id, e.vehicle_id
    from public.transport_effective(p_event_id) e
$$;
revoke all on function public.logistics_working_transport(uuid) from public, anon, authenticated;
grant execute on function public.logistics_working_transport(uuid) to service_role;

-- Perubahan yang belum diterbitkan, per peserta. Dipakai pita "N perubahan
-- belum diterbitkan" dan dialog Terbitkan.
create or replace function public.logistics_pending_changes(p_event_id uuid)
returns table (participant_id uuid, room_changed boolean, bus_changed boolean)
language sql
stable
security definer
set search_path = public
as $$
  with kamar as (
    select coalesce(w.participant_id, s.participant_id) as participant_id
      from (select a.participant_id, a.room_id, a.check_in_at, a.check_out_at
              from public.lodging_assignments a
              join public.participants p on p.id = a.participant_id and p.source_removed_at is null
             where a.event_id = p_event_id) w
      full join (select * from public.logistics_published_lodging where event_id = p_event_id) s
        on s.participant_id = w.participant_id
     where w.room_id is distinct from s.room_id
        or w.check_in_at is distinct from s.check_in_at
        or w.check_out_at is distinct from s.check_out_at
  ),
  bus as (
    select distinct coalesce(w.participant_id, s.participant_id) as participant_id
      from public.logistics_working_transport(p_event_id) w
      full join (select * from public.logistics_published_transport where event_id = p_event_id) s
        on s.participant_id = w.participant_id and s.trip_key = w.trip_key
     where (w.participant_id is null) <> (s.participant_id is null)
        or w.vehicle_id is distinct from s.vehicle_id
  )
  -- Peserta yang sudah dihapus dari sumber tidak dihitung: mereka tidak bisa
  -- masuk lagi, dan tidak boleh ikut menerima "Beri tahu peserta".
  select p.id,
         k.participant_id is not null,
         b.participant_id is not null
    from kamar k
    full join bus b on b.participant_id = k.participant_id
    join public.participants p on p.id = coalesce(k.participant_id, b.participant_id)
   where p.source_removed_at is null
$$;
revoke all on function public.logistics_pending_changes(uuid) from public, anon, authenticated;
grant execute on function public.logistics_pending_changes(uuid) to service_role;

-- Terbitkan: salin salinan kerja ke salinan terbit dalam satu transaksi,
-- simpan sakelar, dan catat siapa yang berubah.
create or replace function public.publish_logistics(
  p_event_id uuid,
  p_actor uuid,
  p_rooms boolean,
  p_transport boolean,
  p_items boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
  n_kamar int;
  n_bus int;
begin
  -- Satu terbit per acara pada satu waktu: dua admin yang menekan bersamaan
  -- tidak boleh saling menimpa salinan di tengah jalan.
  perform pg_advisory_xact_lock(hashtext('publish_logistics:' || p_event_id::text));

  select coalesce(array_agg(participant_id), '{}'),
         count(*) filter (where room_changed),
         count(*) filter (where bus_changed)
    into ids, n_kamar, n_bus
    from public.logistics_pending_changes(p_event_id);

  delete from public.logistics_published_lodging where event_id = p_event_id;
  insert into public.logistics_published_lodging (event_id, participant_id, room_id, check_in_at, check_out_at)
  select a.event_id, a.participant_id, a.room_id, a.check_in_at, a.check_out_at
    from public.lodging_assignments a
    join public.participants p on p.id = a.participant_id and p.source_removed_at is null
   where a.event_id = p_event_id;

  delete from public.logistics_published_transport where event_id = p_event_id;
  insert into public.logistics_published_transport (event_id, participant_id, trip_key, vehicle_id)
  select p_event_id, w.participant_id, w.trip_key, w.vehicle_id
    from public.logistics_working_transport(p_event_id) w;

  insert into public.lodging_settings (event_id, publish_rooms, publish_transport, publish_items,
                                       published_at, published_by, updated_at, updated_by)
  values (p_event_id, p_rooms, p_transport, p_items, now(), p_actor, now(), p_actor)
  on conflict (event_id) do update
     set publish_rooms = excluded.publish_rooms,
         publish_transport = excluded.publish_transport,
         publish_items = excluded.publish_items,
         published_at = excluded.published_at,
         published_by = excluded.published_by,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by;

  insert into public.logistics_publish_log (event_id, published_by, publish_rooms, publish_transport,
                                            publish_items, changed_participant_ids, rooms_changed, buses_changed)
  values (p_event_id, p_actor, p_rooms, p_transport, p_items, ids, n_kamar, n_bus);

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'logistics.publish',
          jsonb_build_object('rooms', p_rooms, 'transport', p_transport, 'items', p_items,
                             'rooms_changed', n_kamar, 'buses_changed', n_bus));

  return jsonb_build_object('changed_participant_ids', to_jsonb(ids),
                            'rooms_changed', n_kamar, 'buses_changed', n_bus);
end $$;
revoke all on function public.publish_logistics(uuid, uuid, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.publish_logistics(uuid, uuid, boolean, boolean, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Area peserta membaca salinan terbit.
--
-- Yang belum diterbitkan tidak pernah keluar dari database (prinsip yang sama
-- dengan teman sekamar di versi sebelumnya). `published` memberi tahu
-- Dashboard saya bagian mana yang sedang disiapkan, supaya kartunya menulis
-- "Kamar sedang disiapkan panitia" alih-alih menghilang.
--
-- Bentuk keluaran lodging/transport/items sama dengan versi 202609300005,
-- ditambah `published` dan `rundown_item_id` di setiap agenda.
-- ---------------------------------------------------------------------------
create or replace function public.member_logistics(p_event_id uuid, p_participant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  setelan public.lodging_settings%rowtype;
  tampil_teman boolean;
  kamar jsonb;
  bus_bawaan text;
  agenda jsonb := '[]'::jsonb;
  barang jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1 from public.participants
     where id = p_participant_id and event_id = p_event_id and source_removed_at is null
  ) then
    return null;
  end if;

  select * into setelan from public.lodging_settings where event_id = p_event_id;
  if not found then
    setelan.logistics_enabled := false;
    setelan.publish_rooms := false;
    setelan.publish_transport := false;
    setelan.publish_items := false;
  end if;

  select coalesce((landing_config -> 'member' ->> 'show_roommates')::boolean, true)
    into tampil_teman
    from public.events where id = p_event_id;

  if setelan.publish_rooms then
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
                 from public.logistics_published_lodging a2
                 join public.participants p on p.id = a2.participant_id
                where a2.event_id = p_event_id
                  and a2.room_id = r.id
                  and a2.participant_id <> p_participant_id
                  and p.source_removed_at is null
             ) end)
      into kamar
      from public.logistics_published_lodging a
      join public.lodging_rooms r on r.id = a.room_id
      join public.lodging_hotels h on h.id = r.hotel_id
     where a.event_id = p_event_id and a.participant_id = p_participant_id;
  end if;

  if setelan.publish_transport then
    select v.code into bus_bawaan
      from public.logistics_published_transport s
      join public.transport_vehicles v on v.id = s.vehicle_id
     where s.event_id = p_event_id and s.trip_key = 0 and s.participant_id = p_participant_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'name', t.name,
             'depart_at', t.depart_at,
             'origin', t.origin,
             'destination', t.destination,
             'meeting_point', t.meeting_point,
             'rundown_item_id', t.rundown_item_id,
             -- null = peserta tidak naik bus di agenda ini.
             'bus', v.code,
             'differs_from_default', v.code is distinct from bus_bawaan
           ) order by t.sort_order, t.depart_at nulls last, t.id), '[]'::jsonb)
      into agenda
      from public.logistics_published_transport s
      join public.transport_trips t on t.id = s.trip_key and t.event_id = p_event_id
      left join public.transport_vehicles v on v.id = s.vehicle_id
     where s.event_id = p_event_id and s.participant_id = p_participant_id and s.trip_key <> 0;
  end if;

  if setelan.publish_items then
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
  end if;

  return jsonb_build_object(
    'enabled', setelan.logistics_enabled,
    'published', jsonb_build_object('rooms', setelan.publish_rooms,
                                    'transport', setelan.publish_transport,
                                    'items', setelan.publish_items),
    'lodging', kamar,
    'transport', case when bus_bawaan is null and agenda = '[]'::jsonb then null
                      else jsonb_build_object('default_bus', bus_bawaan, 'trips', agenda) end,
    'items', barang);
end $$;

revoke all on function public.member_logistics(uuid, uuid) from public, anon, authenticated;
grant execute on function public.member_logistics(uuid, uuid) to service_role;

commit;
