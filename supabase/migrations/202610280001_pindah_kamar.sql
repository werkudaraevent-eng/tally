-- ============================================================================
-- Pindah kamar di hotel yang sama (Logistics > Stays).
-- Disetujui Hanung 2026-10-28: peserta di Royal Ambarrukmo 5-8 Nov tetap
-- check-out 6 Nov dan pindah kamar, jadi punya dua stay di satu hotel:
--
--   peserta A, Royal, kamar 1208, 5 Nov 14.00 -> 6 Nov 12.00
--   peserta A, Royal, kamar 1410, 6 Nov 14.00 -> 8 Nov 12.00
--
-- 202610230002 mengunci satu stay per peserta per hotel. Migrasi ini melepas
-- kunci itu: satu stay = satu baris, dikenali lewat id-nya sendiri. Malam
-- antar-stay seorang peserta tetap tidak boleh bertabrakan; itu dijaga
-- fungsi-fungsi di bawah (satu-satunya jalan menulis tabel ini).
--
-- Kapasitas dan aturan sesama jenis kelamin kini per malam: kamar 1208 yang
-- dikosongkan 6 Nov boleh diisi orang lain mulai 6 Nov. Stay tanpa tanggal
-- (ikut tanggal kamar, lalu hotel; null = tanpa batas) tetap dihitung
-- sepanjang acara, jadi kamar tanpa tanggal berperilaku sama seperti dulu.
--
-- Fungsi:
--   lodging_rentang  BARU: rentang malam efektif sebuah stay
--   lodging_cek_kamar BARU (internal): kapasitas dan jenis kelamin per malam
--   replace_stays    BARU: ganti semua stay beberapa peserta sekaligus, satu
--                    transaksi (dialog Assign to hotel dan impor Excel)
--   assign_room      + p_stay_id; kapasitas per malam
--   assign_hotel     tanpa ON CONFLICT (kuncinya dilepas), perilaku sama
--   set_stay         + p_stay_id, p_tambah; memotong stay lain di hotel mana pun
--   unassign_room    + p_stay_id
--   member_logistics teman sekamar hanya yang malamnya bertabrakan
-- Semuanya SECURITY DEFINER dan hanya untuk service_role.
--
-- Satu transaksi, aman dijalankan ulang. Kode lama tetap jalan sesudah
-- migrasi ini: semua panggilan lama (argumen bernama tanpa p_stay_id) tetap
-- cocok dan berperilaku sama selama belum ada dua stay di satu hotel.
-- ============================================================================

begin;

set local lock_timeout = '5s';

-- 1. Kunci satu stay per hotel dilepas; indeks peserta menggantikan
--    pencariannya.
alter table public.lodging_assignments
  drop constraint if exists lodging_assignments_participant_hotel_unique;
create index if not exists lodging_assignments_participant_idx
  on public.lodging_assignments (event_id, participant_id);

-- 2. Rentang malam efektif: [masuk, keluar), null = tanpa batas. Tanggal yang
--    terbalik (stay hanya punya check-in, check-out dari hotel lebih awal)
--    menjadi rentang kosong, yang tidak bertabrakan dengan apa pun.
create or replace function public.lodging_rentang(p_masuk timestamptz, p_keluar timestamptz)
returns tstzrange
language sql
immutable
set search_path = public
as $$
  select case
    when p_masuk is not null and p_keluar is not null and p_keluar <= p_masuk then 'empty'::tstzrange
    else tstzrange(coalesce(p_masuk, '-infinity'::timestamptz), coalesce(p_keluar, 'infinity'::timestamptz), '[)')
  end
$$;

revoke all on function public.lodging_rentang(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.lodging_rentang(timestamptz, timestamptz) to service_role;

-- 3. Pemeriksaan kamar sesudah ditulis (dalam transaksi pemanggil). Untuk
--    setiap kamar yang disebut: jumlah penghuni pada satu waktu tidak melebihi
--    kapasitas (puncaknya selalu di awal salah satu stay), dan bila aturan
--    sesama jenis kelamin aktif, peserta yang baru ditulis tidak berbagi malam
--    dengan jenis kelamin lain. Melempar galat yang sama seperti dulu.
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

  create temp table if not exists lodging_cek_huni (
    room_id bigint, participant_id uuid, rentang tstzrange, gender text
  ) on commit drop;
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

  select r.room_number, r.capacity, x.jumlah into penuh
    from (
      select s.room_id, max((select count(*) from lodging_cek_huni t
                              where t.room_id = s.room_id and t.rentang @> lower(s.rentang))) as jumlah
        from lodging_cek_huni s
       where not isempty(s.rentang)
       group by s.room_id
    ) x
    join public.lodging_rooms r on r.id = x.room_id
   where x.jumlah > r.capacity
   order by r.room_number
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

-- 4. replace_stays: semua stay peserta-peserta ini diganti daftar baru,
--    semua atau tidak sama sekali.
--    p_items: [{"participant_id": uuid, "stays": [{"hotel_id": int,
--              "room_id": int|null, "check_in_at": iso|null,
--              "check_out_at": iso|null}, ...]}, ...]
--    Daftar stays kosong = tanpa hotel. Peserta yang tidak disebut tidak
--    berubah. Hotel yang sama boleh muncul lebih dari sekali; malam antar-stay
--    seorang peserta tidak boleh bertabrakan (LODGING_STAYS_OVERLAP).
create or replace function public.replace_stays(
  p_event_id uuid,
  p_items jsonb,
  p_actor uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
  kamar bigint[];
  jumlah int;
  tabrak record;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'STAYS_INVALID';
  end if;

  create temp table if not exists replace_stays_baru (
    participant_id uuid, urut int, hotel_id bigint, room_id bigint,
    check_in_at timestamptz, check_out_at timestamptz
  ) on commit drop;
  truncate replace_stays_baru;

  select coalesce(array_agg(distinct (i ->> 'participant_id')::uuid), '{}') into ids
    from jsonb_array_elements(p_items) as i;
  if cardinality(ids) = 0 then
    return 0;
  end if;
  if cardinality(ids) <> jsonb_array_length(p_items) then
    raise exception 'STAYS_INVALID';
  end if;

  if (select count(*) from public.participants
       where id = any(ids) and event_id = p_event_id and source_removed_at is null) <> cardinality(ids) then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  insert into replace_stays_baru
  select (i ->> 'participant_id')::uuid, s.urut::int,
         (s.v ->> 'hotel_id')::bigint, nullif(s.v ->> 'room_id', '')::bigint,
         nullif(s.v ->> 'check_in_at', '')::timestamptz, nullif(s.v ->> 'check_out_at', '')::timestamptz
    from jsonb_array_elements(p_items) as i
    cross join lateral jsonb_array_elements(coalesce(i -> 'stays', '[]'::jsonb)) with ordinality as s(v, urut);

  if exists (select 1 from replace_stays_baru b
              where b.hotel_id is null
                 or not exists (select 1 from public.lodging_hotels h where h.id = b.hotel_id and h.event_id = p_event_id)) then
    raise exception 'HOTEL_NOT_FOUND';
  end if;
  if exists (select 1 from replace_stays_baru b
              where b.room_id is not null
                and not exists (select 1 from public.lodging_rooms r
                                 where r.id = b.room_id and r.event_id = p_event_id and r.hotel_id = b.hotel_id)) then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if exists (select 1 from replace_stays_baru
              where check_in_at is not null and check_out_at is not null and check_out_at <= check_in_at) then
    raise exception 'LODGING_DATES_INVALID';
  end if;

  -- Malam efektif antar-stay seorang peserta (stay, lalu kamar, lalu hotel).
  select p.name, x.a_urut, x.b_urut into tabrak
    from (
      select a.participant_id, a.urut as a_urut, b.urut as b_urut
        from (select n.*, public.lodging_rentang(coalesce(n.check_in_at, r.check_in_at, h.check_in_at),
                                                 coalesce(n.check_out_at, r.check_out_at, h.check_out_at)) as rentang
                from replace_stays_baru n
                join public.lodging_hotels h on h.id = n.hotel_id
                left join public.lodging_rooms r on r.id = n.room_id) a
        join (select n.*, public.lodging_rentang(coalesce(n.check_in_at, r.check_in_at, h.check_in_at),
                                                 coalesce(n.check_out_at, r.check_out_at, h.check_out_at)) as rentang
                from replace_stays_baru n
                join public.lodging_hotels h on h.id = n.hotel_id
                left join public.lodging_rooms r on r.id = n.room_id) b
          on b.participant_id = a.participant_id and b.urut > a.urut
       where a.rentang && b.rentang
    ) x
    join public.participants p on p.id = x.participant_id
   limit 1;
  if found then
    raise exception using message = 'LODGING_STAYS_OVERLAP',
      detail = format('%s: stay %s and stay %s overlap', tabrak.name, tabrak.a_urut, tabrak.b_urut);
  end if;

  insert into public.audit_logs (event_id, user_id, action, payload)
  select p_event_id, p_actor, 'lodging_stays_replaced', jsonb_build_object(
           'participant_id', x,
           'previous', (select coalesce(jsonb_agg(jsonb_build_object('hotel_id', a.hotel_id, 'room_id', a.room_id,
                                                                     'check_in_at', a.check_in_at, 'check_out_at', a.check_out_at)
                                                  order by a.id), '[]'::jsonb)
                          from public.lodging_assignments a
                         where a.event_id = p_event_id and a.participant_id = x),
           'stays', (select coalesce(jsonb_agg(jsonb_build_object('hotel_id', b.hotel_id, 'room_id', b.room_id,
                                                                  'check_in_at', b.check_in_at, 'check_out_at', b.check_out_at)
                                               order by b.urut), '[]'::jsonb)
                       from replace_stays_baru b where b.participant_id = x))
    from unnest(ids) as x;

  -- Kamar lama ikut diperiksa tidak perlu: melepas penghuni tidak pernah
  -- membuat kamar penuh. Hanya kamar tujuan.
  delete from public.lodging_assignments
   where event_id = p_event_id and participant_id = any(ids);

  insert into public.lodging_assignments (event_id, hotel_id, room_id, participant_id, check_in_at, check_out_at, created_by)
  select p_event_id, hotel_id, room_id, participant_id, check_in_at, check_out_at, p_actor
    from replace_stays_baru
   order by participant_id, urut;
  get diagnostics jumlah = row_count;

  select coalesce(array_agg(distinct room_id), '{}') into kamar
    from replace_stays_baru where room_id is not null;
  perform public.lodging_cek_kamar(p_event_id, kamar, ids);

  return jumlah;
end $$;

revoke all on function public.replace_stays(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.replace_stays(uuid, jsonb, uuid) to service_role;

-- 5. assign_room: badan 202610230002 + p_stay_id.
--    Stay yang diisi kamarnya: p_stay_id bila ada (harus milik peserta ini dan
--    di hotel kamar ini); tanpa itu, satu-satunya stay peserta di hotel kamar
--    ini, atau satu-satunya yang belum berkamar (STAY_AMBIGUOUS bila tetap
--    lebih dari satu). Tidak ada stay di hotel itu: semua stay diganti stay
--    kamar ini, seperti sebelumnya. Kapasitas dan jenis kelamin per malam.
drop function if exists public.assign_room(uuid, bigint, uuid, uuid, timestamptz, timestamptz);
create or replace function public.assign_room(
  p_event_id uuid,
  p_room_id bigint,
  p_participant_id uuid,
  p_actor uuid default null,
  p_check_in_at timestamptz default null,
  p_check_out_at timestamptz default null,
  p_stay_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  kamar public.lodging_rooms;
  peserta public.participants;
  target bigint;
  kamar_lama bigint;
  calon int;
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

  if p_stay_id is not null then
    select id, room_id into target, kamar_lama from public.lodging_assignments
     where id = p_stay_id and event_id = p_event_id and participant_id = p_participant_id and hotel_id = kamar.hotel_id;
    if target is null then
      raise exception 'STAY_NOT_FOUND';
    end if;
  else
    select count(*) into calon from public.lodging_assignments
     where event_id = p_event_id and participant_id = p_participant_id and hotel_id = kamar.hotel_id;
    if calon = 1 then
      select id, room_id into target, kamar_lama from public.lodging_assignments
       where event_id = p_event_id and participant_id = p_participant_id and hotel_id = kamar.hotel_id;
    elsif calon > 1 then
      -- Sudah di kamar ini: tidak ada yang diubah selain tanggalnya.
      select id, room_id into target, kamar_lama from public.lodging_assignments
       where event_id = p_event_id and participant_id = p_participant_id and hotel_id = kamar.hotel_id
         and room_id = p_room_id
       order by id limit 1;
      if target is null and (select count(*) from public.lodging_assignments
                              where event_id = p_event_id and participant_id = p_participant_id
                                and hotel_id = kamar.hotel_id and room_id is null) = 1 then
        select id, room_id into target, kamar_lama from public.lodging_assignments
         where event_id = p_event_id and participant_id = p_participant_id and hotel_id = kamar.hotel_id and room_id is null;
      end if;
      if target is null then
        raise exception 'STAY_AMBIGUOUS';
      end if;
    end if;
  end if;

  if target is not null then
    update public.lodging_assignments
       set room_id = p_room_id,
           check_in_at = coalesce(p_check_in_at, check_in_at),
           check_out_at = coalesce(p_check_out_at, check_out_at),
           created_at = now(),
           created_by = p_actor
     where id = target;
  else
    delete from public.lodging_assignments
     where event_id = p_event_id and participant_id = p_participant_id;
    insert into public.lodging_assignments (event_id, hotel_id, room_id, participant_id, check_in_at, check_out_at, created_by)
    values (p_event_id, kamar.hotel_id, p_room_id, p_participant_id, p_check_in_at, p_check_out_at, p_actor);
  end if;

  perform public.lodging_cek_kamar(p_event_id, array[p_room_id], array[p_participant_id]);

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'lodging_assigned', jsonb_build_object(
    'participant_id', p_participant_id, 'room_id', p_room_id, 'room_number', kamar.room_number,
    'hotel_id', kamar.hotel_id, 'previous_room_id', kamar_lama, 'stay_id', target));

  return jsonb_build_object('room_id', p_room_id, 'previous_room_id', kamar_lama);
end $$;

revoke all on function public.assign_room(uuid, bigint, uuid, uuid, timestamptz, timestamptz, bigint) from public, anon, authenticated;
grant execute on function public.assign_room(uuid, bigint, uuid, uuid, timestamptz, timestamptz, bigint) to service_role;

-- 6. assign_hotel ("All nights"): badan 202610230002 tanpa ON CONFLICT.
--    Semua stay peserta diganti satu stay di hotel ini tanpa kamar, ikut
--    tanggal hotel.
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
   where event_id = p_event_id and participant_id = any(ids);

  insert into public.lodging_assignments (event_id, hotel_id, room_id, participant_id, created_by)
  select p_event_id, p_hotel_id, null, x, p_actor from unnest(ids) as x;
  get diagnostics jumlah = row_count;
  return jumlah;
end $$;

revoke all on function public.assign_hotel(uuid, bigint, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.assign_hotel(uuid, bigint, uuid[], uuid) to service_role;

-- 7. set_stay ("Only some nights"): badan 202610230002 + p_stay_id, p_tambah.
--    Stay yang diubah: p_stay_id bila ada (satu peserta, hotel stay itu);
--    p_tambah = selalu stay baru (Stays > Add another stay, juga di hotel yang
--    sudah ada); tanpa keduanya, satu-satunya stay peserta di hotel ini, atau
--    stay baru bila belum ada (STAY_AMBIGUOUS bila lebih dari satu). Kamarnya tetap. Stay
--    LAIN yang malamnya bertabrakan, di hotel mana pun, dipotong atau dihapus
--    seperti sebelumnya. p_trim false: tanpa memotong (impor Excel lama).
drop function if exists public.set_stay(uuid, bigint, uuid[], timestamptz, timestamptz, uuid, boolean);
drop function if exists public.set_stay(uuid, bigint, uuid[], timestamptz, timestamptz, uuid, boolean, bigint);
create or replace function public.set_stay(
  p_event_id uuid,
  p_hotel_id bigint,
  p_participant_ids uuid[],
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_actor uuid default null,
  p_trim boolean default true,
  p_stay_id bigint default null,
  p_tambah boolean default false
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
  kamar bigint[];
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

  -- Stay sasaran per peserta (null = buat baru).
  create temp table if not exists set_stay_sasaran (participant_id uuid, stay_id bigint) on commit drop;
  truncate set_stay_sasaran;
  if p_stay_id is not null then
    if cardinality(ids) <> 1 or not exists (
      select 1 from public.lodging_assignments
       where id = p_stay_id and event_id = p_event_id and participant_id = ids[1] and hotel_id = p_hotel_id
    ) then
      raise exception 'STAY_NOT_FOUND';
    end if;
    insert into set_stay_sasaran values (ids[1], p_stay_id);
  elsif p_tambah then
    insert into set_stay_sasaran select x, null from unnest(ids) as x;
  else
    if exists (select 1 from public.lodging_assignments
                where event_id = p_event_id and participant_id = any(ids) and hotel_id = p_hotel_id
                group by participant_id having count(*) > 1) then
      raise exception 'STAY_AMBIGUOUS';
    end if;
    insert into set_stay_sasaran
    select x, (select a.id from public.lodging_assignments a
                where a.event_id = p_event_id and a.participant_id = x and a.hotel_id = p_hotel_id)
      from unnest(ids) as x;
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
     and a.id not in (select stay_id from set_stay_sasaran where stay_id is not null);
  delete from set_stay_lain
   where not p_trim
      or not ((masuk is null or masuk < p_check_out_at) and (keluar is null or keluar > p_check_in_at));

  insert into public.audit_logs (event_id, user_id, action, payload)
  select p_event_id, p_actor, 'lodging_stay_set', jsonb_build_object(
           'participant_id', x, 'hotel_id', p_hotel_id, 'stay_id', p_stay_id,
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

  update public.lodging_assignments a
     set check_in_at = p_check_in_at,
         check_out_at = p_check_out_at,
         created_at = now(),
         created_by = p_actor
    from set_stay_sasaran s
   where a.id = s.stay_id;

  insert into public.lodging_assignments (event_id, hotel_id, room_id, participant_id, check_in_at, check_out_at, created_by)
  select p_event_id, p_hotel_id, null, s.participant_id, p_check_in_at, p_check_out_at, p_actor
    from set_stay_sasaran s where s.stay_id is null;

  select count(*) into jumlah from set_stay_sasaran;

  -- Malam baru bisa bertabrakan dengan penghuni lain kamar ini.
  select coalesce(array_agg(distinct a.room_id), '{}') into kamar
    from public.lodging_assignments a join set_stay_sasaran s on s.stay_id = a.id
   where a.room_id is not null;
  perform public.lodging_cek_kamar(p_event_id, kamar, ids);

  return jumlah;
end $$;

revoke all on function public.set_stay(uuid, bigint, uuid[], timestamptz, timestamptz, uuid, boolean, bigint, boolean) from public, anon, authenticated;
grant execute on function public.set_stay(uuid, bigint, uuid[], timestamptz, timestamptz, uuid, boolean, bigint, boolean) to service_role;

-- 8. unassign_room: badan 202610230002 + p_stay_id. p_stay_id = lepas satu
--    stay itu; p_hotel_id = semua stay di hotel itu; keduanya null = semua.
drop function if exists public.unassign_room(uuid, uuid, uuid, bigint);
create or replace function public.unassign_room(
  p_event_id uuid,
  p_participant_id uuid,
  p_actor uuid default null,
  p_hotel_id bigint default null,
  p_stay_id bigint default null
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
       and (p_stay_id is null or id = p_stay_id)
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

revoke all on function public.unassign_room(uuid, uuid, uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.unassign_room(uuid, uuid, uuid, bigint, bigint) to service_role;

-- 9. member_logistics: badan 202610230002. Teman sekamar sebuah stay hanya
--    yang malamnya bertabrakan dengan stay itu (penghuni kamar 1208 sesudah
--    6 Nov bukan teman sekamar peserta yang keluar 6 Nov).
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
notify pgrst, 'reload schema';

commit;
