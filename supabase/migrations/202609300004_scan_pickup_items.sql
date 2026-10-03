-- ---------------------------------------------------------------------------
-- Logistik peserta (3/4): item yang diambil peserta di sesi scan.
--
-- Rancangan lengkap: tasks/logistik-peserta-plan.md.
--
-- Keputusan panitia (30 Sep 2026): pengambilan kaos dan barang lain ditandai
-- lewat scan operator. Admin membuat sesi scan yang memuat lebih dari
-- registrasi kedatangan: sesi itu juga memeriksa item apa saja yang diambil
-- peserta di meja tersebut.
--
-- Sesi scan sudah ada (`attendance_sessions`, 202608220002). Yang ditambahkan:
--
--   pickup_items               barang yang dibagikan di acara ini (kaos, goodie
--                              bag, ID card). Tidak terikat ke satu sesi, karena
--                              barang yang sama bisa dibagikan di dua meja.
--   attendance_session_items   item mana yang diperiksa di sesi scan mana.
--   item_pickups               satu baris per peserta per item yang sudah
--                              diambil, beserta sesi dan jalur tempat ia diambil.
--
-- Ukuran TIDAK disimpan di sini. Ukuran kaos sudah ada di data peserta
-- (field formulir, di `participants.extra`), jadi item cukup menyebut key
-- field-nya. Layar scan menampilkan ukuran itu, dan `item_pickups.size`
-- menyalin nilainya saat diambil: bila ukuran diubah setelah kaos diserahkan,
-- catatan tetap menunjukkan kaos yang benar-benar dibawa pulang.
--
-- Mengambil item adalah langkah terpisah dari `record_attendance_scan`.
-- Pemindaian kehadiran tetap satu jalur yang sudah teruji di hari-H; layar scan
-- memanggil `pickup_checklist` setelah pemindaian untuk menampilkan daftar
-- centang, lalu `record_item_pickup` untuk item yang diserahkan. Petugas bisa
-- mencatat kedatangan tanpa menyerahkan barang (stok habis), dan sebaliknya.
--
-- Akses hanya lewat service role, sama seperti tabel lain.
-- ---------------------------------------------------------------------------

-- Kunci komposit untuk FK anak, pola yang sama dengan 202608070002.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_sessions_event_id_unique'
  ) then
    alter table public.attendance_sessions
      add constraint attendance_sessions_event_id_unique unique (event_id, id);
  end if;
end $$;

create table if not exists public.pickup_items (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  -- Key di `participants.extra` yang berisi ukuran, mis. "ukuran_kaos". Null
  -- untuk barang tanpa ukuran.
  size_field_key text,
  -- Tampil ke peserta: "Ambil di meja registrasi, lobi utama".
  pickup_note text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pickup_items_event_id_unique unique (event_id, id),
  constraint pickup_items_name_unique unique (event_id, name)
);

create table if not exists public.attendance_session_items (
  event_id uuid not null references public.events(id) on delete cascade,
  session_id bigint not null,
  item_id bigint not null,
  sort_order int not null default 0,
  primary key (session_id, item_id),
  foreign key (event_id, session_id) references public.attendance_sessions(event_id, id) on delete cascade,
  foreign key (event_id, item_id) references public.pickup_items(event_id, id) on delete cascade
);

create table if not exists public.item_pickups (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  item_id bigint not null,
  participant_id uuid not null,
  -- Ukuran saat diserahkan, disalin dari `participants.extra`.
  size text,
  -- `set null`: menghapus sesi atau jalur tidak boleh menghapus bukti bahwa
  -- barangnya sudah diserahkan.
  session_id bigint references public.attendance_sessions(id) on delete set null,
  lane_id bigint references public.attendance_lanes(id) on delete set null,
  picked_up_at timestamptz not null default now(),
  picked_up_by uuid references public.users(id) on delete set null,
  -- Satu item satu kali per peserta. Menyerahkan dua kaos ke orang yang sama
  -- adalah kesalahan yang justru harus ditahan di meja.
  constraint item_pickups_unique unique (item_id, participant_id),
  foreign key (event_id, item_id) references public.pickup_items(event_id, id) on delete cascade,
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete cascade
);

create index if not exists item_pickups_participant_idx on public.item_pickups (event_id, participant_id);

alter table public.pickup_items enable row level security;
alter table public.attendance_session_items enable row level security;
alter table public.item_pickups enable row level security;
revoke all on table public.pickup_items from public, anon, authenticated;
revoke all on table public.attendance_session_items from public, anon, authenticated;
revoke all on table public.item_pickups from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Daftar centang di layar scan: item sesi ini, ukuran peserta, dan apakah
-- sudah diambil (di sesi mana pun).
-- ---------------------------------------------------------------------------
create or replace function public.pickup_checklist(
  p_event_id uuid,
  p_session_id bigint,
  p_participant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', i.id,
           'name', i.name,
           'size', nullif(btrim(p.extra ->> i.size_field_key), ''),
           'has_size', i.size_field_key is not null,
           'picked_up_at', k.picked_up_at,
           'picked_up_size', k.size
         ) order by si.sort_order, i.sort_order, i.id), '[]'::jsonb)
    from public.attendance_session_items si
    join public.pickup_items i on i.id = si.item_id
    join public.participants p on p.id = p_participant_id and p.event_id = p_event_id
    left join public.item_pickups k on k.item_id = i.id and k.participant_id = p.id
   where si.session_id = p_session_id and si.event_id = p_event_id
$$;

revoke all on function public.pickup_checklist(uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.pickup_checklist(uuid, bigint, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Tandai item diserahkan.
--
-- Item yang sudah diambil sebelumnya TIDAK ditimpa: waktunya, petugasnya, dan
-- ukurannya tetap yang pertama, dan item itu dilaporkan di `already` supaya
-- layar scan bisa memperingatkan petugas.
-- ---------------------------------------------------------------------------
create or replace function public.record_item_pickup(
  p_event_id uuid,
  p_session_id bigint,
  p_participant_id uuid,
  p_item_ids bigint[],
  p_actor uuid default null,
  p_lane_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sesi public.attendance_sessions;
  peserta public.participants;
  baru bigint[];
  sudah bigint[];
begin
  select * into sesi from public.attendance_sessions
   where id = p_session_id and event_id = p_event_id;
  if sesi.id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if not sesi.is_active then
    raise exception 'SESSION_CLOSED';
  end if;

  -- Sama dengan pemindaian kehadiran: peserta yang dihapus di sumber tidak
  -- menerima barang.
  select * into peserta from public.participants
   where id = p_participant_id and event_id = p_event_id and source_removed_at is null;
  if peserta.id is null then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  if exists (
    select 1 from unnest(p_item_ids) x
     where not exists (
       select 1 from public.attendance_session_items si
        where si.session_id = p_session_id and si.item_id = x)
  ) then
    raise exception 'ITEM_NOT_IN_SESSION';
  end if;

  select coalesce(array_agg(item_id), '{}') into sudah
    from public.item_pickups
   where participant_id = p_participant_id and item_id = any (p_item_ids);

  with masuk as (
    insert into public.item_pickups (event_id, item_id, participant_id, size, session_id, lane_id, picked_up_by)
    select p_event_id, i.id, p_participant_id,
           nullif(btrim(peserta.extra ->> i.size_field_key), ''),
           p_session_id, p_lane_id, p_actor
      from public.pickup_items i
     where i.event_id = p_event_id and i.id = any (p_item_ids)
    on conflict (item_id, participant_id) do nothing
    returning item_id
  )
  select coalesce(array_agg(item_id), '{}') into baru from masuk;

  if cardinality(baru) > 0 then
    insert into public.audit_logs (event_id, user_id, action, payload)
    values (p_event_id, p_actor, 'item_picked_up', jsonb_build_object(
      'participant_id', p_participant_id, 'session_id', p_session_id, 'item_ids', to_jsonb(baru)));
  end if;

  return jsonb_build_object(
    'recorded', to_jsonb(baru),
    'already', to_jsonb(sudah),
    'items', public.pickup_checklist(p_event_id, p_session_id, p_participant_id));
end $$;

revoke all on function public.record_item_pickup(uuid, bigint, uuid, bigint[], uuid, bigint) from public, anon, authenticated;
grant execute on function public.record_item_pickup(uuid, bigint, uuid, bigint[], uuid, bigint) to service_role;

-- Batalkan satu penyerahan yang salah centang. Dari admin, bukan dari layar
-- scan: petugas yang bisa membatalkan sendiri juga bisa menyerahkan dua kali.
create or replace function public.undo_item_pickup(
  p_event_id uuid,
  p_item_id bigint,
  p_participant_id uuid,
  p_actor uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  lama public.item_pickups;
begin
  delete from public.item_pickups
   where event_id = p_event_id and item_id = p_item_id and participant_id = p_participant_id
  returning * into lama;

  if lama.id is null then
    return false;
  end if;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'item_pickup_undone', jsonb_build_object(
    'participant_id', p_participant_id, 'item_id', p_item_id,
    'size', lama.size, 'picked_up_at', lama.picked_up_at, 'picked_up_by', lama.picked_up_by));
  return true;
end $$;

revoke all on function public.undo_item_pickup(uuid, bigint, uuid, uuid) from public, anon, authenticated;
grant execute on function public.undo_item_pickup(uuid, bigint, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Rekap per item per ukuran: pesanan ke vendor, dan sisa stok di hari-H.
--
-- Ukuran dibaca dari data peserta saat ini, bukan dari `item_pickups.size`,
-- karena rekap ini dipakai SEBELUM ada yang mengambil. Peserta tanpa ukuran
-- muncul sebagai baris `size` null, supaya panitia tahu berapa yang belum
-- mengisi.
-- ---------------------------------------------------------------------------
create or replace function public.pickup_item_recap(p_event_id uuid)
returns table (item_id bigint, item_name text, size text, participants bigint, picked_up bigint)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.name,
         case when i.size_field_key is null then null
              else nullif(btrim(p.extra ->> i.size_field_key), '') end as ukuran,
         count(*), count(k.id)
    from public.pickup_items i
    join public.participants p on p.event_id = i.event_id and p.source_removed_at is null
    left join public.item_pickups k on k.item_id = i.id and k.participant_id = p.id
   where i.event_id = p_event_id
   group by i.id, i.name, i.sort_order, ukuran
   order by i.sort_order, i.id, ukuran nulls last
$$;

revoke all on function public.pickup_item_recap(uuid) from public, anon, authenticated;
grant execute on function public.pickup_item_recap(uuid) to service_role;
