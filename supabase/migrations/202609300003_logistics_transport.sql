-- ---------------------------------------------------------------------------
-- Logistik peserta (2/4): bus.
--
-- Rancangan lengkap: tasks/logistik-peserta-plan.md.
--
-- Keputusan panitia (30 Sep 2026): bus cukup bernama umum ("Bus 3"), dan yang
-- dilihat peserta hanyalah nomor busnya. Biasanya peserta memakai bus yang
-- sama sepanjang acara, tetapi panitia harus bisa mengganti bus untuk agenda
-- tertentu.
--
-- Karena itu penempatan punya dua lapis di SATU tabel:
--
--   trip_id null      bus bawaan peserta, berlaku di semua agenda
--   trip_id terisi    pengganti untuk satu agenda saja
--
-- Bus peserta di satu agenda = penggantinya bila ada, selain itu bus bawaan.
-- Kasus umum tetap satu kali isi, dan pengecualiannya tidak memaksa panitia
-- mengisi ulang semua agenda.
--
-- Agenda juga bisa TIDAK mengikuti bus bawaan (`follows_default = false`),
-- untuk perjalanan yang disusun ulang seluruhnya (mis. pulang ke dua tujuan).
-- Di agenda seperti itu hanya penggantinya yang berlaku.
--
-- Pengganti dengan `vehicle_id` null berarti "tidak naik bus di agenda ini"
-- (mis. pulang sendiri), yang berbeda dari "belum ditempatkan".
--
-- Akses hanya lewat service role, sama seperti tabel lain.
-- ---------------------------------------------------------------------------

create table if not exists public.transport_vehicles (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  -- Nama yang dilihat peserta: "Bus 3".
  code text not null,
  -- Null = tidak dibatasi.
  capacity smallint check (capacity between 1 and 200),
  plate_number text,
  -- Hanya untuk panitia.
  crew_contact text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transport_vehicles_event_id_unique unique (event_id, id),
  constraint transport_vehicles_code_unique unique (event_id, code)
);

-- Agenda yang memakai bus: berangkat ke venue, ke gala dinner, pulang.
create table if not exists public.transport_trips (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  depart_at timestamptz,
  origin text,
  destination text,
  -- Titik kumpul, tampil ke peserta.
  meeting_point text,
  follows_default boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transport_trips_event_id_unique unique (event_id, id)
);

create table if not exists public.transport_assignments (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  -- Null = bus bawaan.
  trip_id bigint,
  -- Null hanya pada pengganti: "tidak naik bus di agenda ini".
  vehicle_id bigint,
  participant_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  constraint transport_assignments_vehicle_required check (trip_id is not null or vehicle_id is not null),
  foreign key (event_id, trip_id) references public.transport_trips(event_id, id) on delete cascade,
  foreign key (event_id, vehicle_id) references public.transport_vehicles(event_id, id) on delete cascade,
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete cascade
);

-- Satu bus bawaan per peserta, satu pengganti per peserta per agenda.
create unique index if not exists transport_assignments_default_unique
  on public.transport_assignments (event_id, participant_id) where trip_id is null;
create unique index if not exists transport_assignments_trip_unique
  on public.transport_assignments (trip_id, participant_id) where trip_id is not null;
create index if not exists transport_assignments_vehicle_idx
  on public.transport_assignments (vehicle_id, trip_id);

alter table public.transport_vehicles enable row level security;
alter table public.transport_trips enable row level security;
alter table public.transport_assignments enable row level security;
revoke all on table public.transport_vehicles from public, anon, authenticated;
revoke all on table public.transport_trips from public, anon, authenticated;
revoke all on table public.transport_assignments from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bus efektif setiap peserta aktif di setiap agenda.
--
-- Satu-satunya tempat aturan "pengganti, lalu bawaan bila agendanya
-- mengikuti" ditulis. Hitungan kapasitas, rekap admin, dan area peserta
-- semuanya membaca dari sini, supaya ketiganya tidak pernah berbeda pendapat
-- tentang siapa naik bus apa.
--
-- Baris dengan `vehicle_id` null berarti peserta punya pengganti "tidak naik
-- bus"; peserta tanpa bus sama sekali tidak muncul.
-- ---------------------------------------------------------------------------
create or replace function public.transport_effective(p_event_id uuid)
returns table (trip_id bigint, participant_id uuid, vehicle_id bigint, is_override boolean)
language sql
stable
set search_path = public
as $$
  select t.id, p.id,
         case when g.id is not null then g.vehicle_id
              when t.follows_default then b.vehicle_id end,
         g.id is not null
    from public.transport_trips t
    join public.participants p on p.event_id = t.event_id and p.source_removed_at is null
    left join public.transport_assignments g
      on g.trip_id = t.id and g.participant_id = p.id
    left join public.transport_assignments b
      on b.event_id = t.event_id and b.trip_id is null and b.participant_id = p.id
   where t.event_id = p_event_id
     and (g.id is not null or (t.follows_default and b.id is not null))
$$;

revoke all on function public.transport_effective(uuid) from public, anon, authenticated;
grant execute on function public.transport_effective(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Isi per (agenda, bus) untuk grid admin, termasuk yang melebihi kapasitas.
--
-- Kapasitas dijaga saat menempatkan, tetapi tetap bisa terlampaui dari arah
-- lain: kapasitas bus diturunkan, atau agenda diubah jadi mengikuti bus
-- bawaan. Menolak perubahan itu membuat panitia terkunci; menandainya di grid
-- membuat mereka melihat dan membereskannya.
-- ---------------------------------------------------------------------------
create or replace function public.transport_overview(p_event_id uuid)
returns table (trip_id bigint, vehicle_id bigint, code text, capacity smallint, load bigint, over_capacity boolean)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, v.id, v.code, v.capacity, count(e.participant_id),
         v.capacity is not null and count(e.participant_id) > v.capacity
    from public.transport_trips t
    cross join public.transport_vehicles v
    left join public.transport_effective(p_event_id) e
      on e.trip_id = t.id and e.vehicle_id = v.id
   where t.event_id = p_event_id and v.event_id = p_event_id
   group by t.id, v.id, v.code, v.capacity, t.sort_order, v.sort_order
   order by t.sort_order, t.id, v.sort_order, v.id
$$;

revoke all on function public.transport_overview(uuid) from public, anon, authenticated;
grant execute on function public.transport_overview(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Tempatkan banyak peserta sekaligus.
--
--   p_trip_id null,  p_vehicle_id terisi   set bus bawaan
--   p_trip_id null,  p_vehicle_id null     hapus bus bawaan
--   p_trip_id terisi, p_vehicle_id terisi  pengganti di satu agenda
--   p_trip_id terisi, p_vehicle_id null    "tidak naik bus" di satu agenda
--
-- Kembali ke bus bawaan di satu agenda: `reset_bus_override`.
--
-- Semua penulisan bus satu acara diserialkan dengan satu kunci advisory.
-- Mengganti bus bawaan mengubah isi bus di SETIAP agenda yang mengikutinya,
-- dan mengunci baris bus tujuan saja tidak cukup: bus asal di agenda lain ikut
-- berubah. Volume tulis di sini kecil (panitia di CMS), jadi kunci satu acara
-- tidak terasa.
--
-- Kapasitas diperiksa SETELAH menulis, di transaksi yang sama: satu kueri
-- lewat `transport_effective` menilai hasil akhirnya persis seperti yang akan
-- dilihat grid, dan pengecualian membatalkan seluruh penulisan.
-- ---------------------------------------------------------------------------
create or replace function public.assign_bus(
  p_event_id uuid,
  p_trip_id bigint,
  p_vehicle_id bigint,
  p_participant_ids uuid[],
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  bus public.transport_vehicles;
  valid int;
  jumlah_input int;
  penuh record;
  n int;
begin
  perform pg_advisory_xact_lock(hashtextextended('transport:' || p_event_id::text, 0));

  jumlah_input := (select count(distinct x) from unnest(p_participant_ids) x);
  if jumlah_input = 0 then
    return jsonb_build_object('assigned', 0);
  end if;

  if p_trip_id is not null and not exists (
    select 1 from public.transport_trips where id = p_trip_id and event_id = p_event_id
  ) then
    raise exception 'TRIP_NOT_FOUND';
  end if;

  if p_vehicle_id is not null then
    select * into bus from public.transport_vehicles where id = p_vehicle_id and event_id = p_event_id;
    if bus.id is null then
      raise exception 'VEHICLE_NOT_FOUND';
    end if;
  end if;

  select count(*) into valid from public.participants
   where event_id = p_event_id and source_removed_at is null
     and id = any (p_participant_ids);
  if valid <> (select count(distinct x) from unnest(p_participant_ids) x) then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  if p_trip_id is null and p_vehicle_id is null then
    delete from public.transport_assignments
     where event_id = p_event_id and trip_id is null and participant_id = any (p_participant_ids);
    get diagnostics n = row_count;
  elsif p_trip_id is null then
    insert into public.transport_assignments (event_id, trip_id, vehicle_id, participant_id, created_by)
    select p_event_id, null, p_vehicle_id, x, p_actor from (select distinct unnest(p_participant_ids) x) s
    on conflict (event_id, participant_id) where trip_id is null do update
      set vehicle_id = excluded.vehicle_id, created_at = now(), created_by = excluded.created_by;
    get diagnostics n = row_count;
  else
    insert into public.transport_assignments (event_id, trip_id, vehicle_id, participant_id, created_by)
    select p_event_id, p_trip_id, p_vehicle_id, x, p_actor from (select distinct unnest(p_participant_ids) x) s
    on conflict (trip_id, participant_id) where trip_id is not null do update
      set vehicle_id = excluded.vehicle_id, created_at = now(), created_by = excluded.created_by;
    get diagnostics n = row_count;
  end if;

  -- Hanya bus tujuan yang bisa bertambah isinya. Bila bus bawaan yang diubah,
  -- semua agenda yang mengikutinya ikut diperiksa.
  if bus.id is not null and bus.capacity is not null then
    select t.name, count(*) as isi into penuh
      from public.transport_effective(p_event_id) e
      join public.transport_trips t on t.id = e.trip_id
     where e.vehicle_id = bus.id
       and (p_trip_id is null or e.trip_id = p_trip_id)
     group by t.id, t.name
    having count(*) > bus.capacity
     limit 1;
    if penuh.name is not null then
      raise exception using message = 'VEHICLE_FULL',
        detail = format('%s di agenda "%s": %s dari %s tempat', bus.code, penuh.name, penuh.isi, bus.capacity);
    end if;

    -- Tanpa agenda sama sekali, bus bawaan tetap tidak boleh melebihi
    -- kapasitas: agenda biasanya dibuat SETELAH penempatan diimpor.
    if p_trip_id is null then
      select count(*) into n from public.transport_assignments a
        join public.participants p on p.id = a.participant_id
       where a.event_id = p_event_id and a.trip_id is null and a.vehicle_id = bus.id
         and p.source_removed_at is null;
      if n > bus.capacity then
        raise exception using message = 'VEHICLE_FULL',
          detail = format('%s: %s dari %s tempat', bus.code, n, bus.capacity);
      end if;
    end if;
  end if;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'transport_assigned', jsonb_build_object(
    'trip_id', p_trip_id, 'vehicle_id', p_vehicle_id, 'vehicle_code', bus.code,
    'participant_ids', to_jsonb(p_participant_ids)));

  return jsonb_build_object('assigned', jumlah_input);
end $$;

revoke all on function public.assign_bus(uuid, bigint, bigint, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.assign_bus(uuid, bigint, bigint, uuid[], uuid) to service_role;

-- Kembalikan peserta ke bus bawaannya di satu agenda. Bisa membuat bus bawaan
-- melebihi kapasitas di agenda itu, jadi diperiksa dengan cara yang sama.
create or replace function public.reset_bus_override(
  p_event_id uuid,
  p_trip_id bigint,
  p_participant_ids uuid[],
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  penuh record;
begin
  perform pg_advisory_xact_lock(hashtextextended('transport:' || p_event_id::text, 0));

  delete from public.transport_assignments
   where event_id = p_event_id and trip_id = p_trip_id and participant_id = any (p_participant_ids);
  get diagnostics n = row_count;

  select v.code, v.capacity, count(*) as isi into penuh
    from public.transport_effective(p_event_id) e
    join public.transport_vehicles v on v.id = e.vehicle_id
   where e.trip_id = p_trip_id and v.capacity is not null
     -- Hanya bus yang menerima peserta ini. Bus lain yang sudah kelebihan
     -- (kapasitasnya diturunkan) bukan urusan pengembalian ini.
     and v.id in (
       select x.vehicle_id from public.transport_effective(p_event_id) x
        where x.trip_id = p_trip_id and x.participant_id = any (p_participant_ids))
   group by v.id, v.code, v.capacity
  having count(*) > v.capacity
   limit 1;
  if penuh.code is not null then
    raise exception using message = 'VEHICLE_FULL',
      detail = format('%s: %s dari %s tempat', penuh.code, penuh.isi, penuh.capacity);
  end if;

  if n > 0 then
    insert into public.audit_logs (event_id, user_id, action, payload)
    values (p_event_id, p_actor, 'transport_override_reset', jsonb_build_object(
      'trip_id', p_trip_id, 'participant_ids', to_jsonb(p_participant_ids)));
  end if;

  return jsonb_build_object('reset', n);
end $$;

revoke all on function public.reset_bus_override(uuid, bigint, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.reset_bus_override(uuid, bigint, uuid[], uuid) to service_role;
