-- Stasiun cetak: laptop di meja registrasi yang mencetak badge kertas untuk HP
-- dan tablet pemindai.
--
-- HP tidak pernah bicara ke printer. Pemindaian (di server, dalam permintaan
-- scan yang sama) menaruh satu pekerjaan di antrean; laptop stasiun menariknya
-- lewat polling sekitar 1,5 detik dan mencetaknya dengan Chrome
-- --kiosk-printing. Polling yang sama memperpanjang lease stasiun, sehingga
-- "Tersambung" di HP berarti "stasiun menarik antrean beberapa detik lalu".
--
-- Tiga aturan yang menjaga badge tidak dobel:
--
-- 1. Satu nama stasiun hanya hidup di SATU laptop. Lease (token + batas waktu)
--    dipegang laptop yang terakhir mengklaim; setiap pengambilan dan setiap
--    laporan hasil wajib membawa token itu. Laptop yang bangun dari sleep
--    setelah diambil alih tidak bisa lagi mengambil atau menyelesaikan apa pun.
-- 2. Satu peserta hanya SEKALI dicetak otomatis per acara: unique index parsial
--    pada jenis 'otomatis'. Cetak ulang adalah baris 'ulang' yang disengaja.
-- 3. Pekerjaan yang macet di 'diambil' (laptop mati di tengah cetak) menjadi
--    'gagal', BUKAN diantrekan lagi: badge-nya mungkin sudah keluar.
--
-- Antrean hanya menyimpan participant_id. Nama, instansi, dan QR dibaca stasiun
-- saat mencetak, jadi tabel ini tidak menyimpan salinan data pribadi.

create table if not exists public.badge_stasiun (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  nama text not null,
  -- Lease: siapa yang sedang memegang nama ini, sampai kapan.
  lease_token uuid,
  lease_until timestamptz,
  last_seen_at timestamptz,
  dijeda boolean not null default false,
  created_at timestamptz not null default now(),
  constraint badge_stasiun_nama check (char_length(btrim(nama)) between 1 and 40)
);

create unique index if not exists badge_stasiun_nama_unik
  on public.badge_stasiun (event_id, lower(btrim(nama)));

create table if not exists public.badge_cetak_antrean (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  stasiun_id bigint not null references public.badge_stasiun(id) on delete cascade,
  -- Kosong hanya untuk cetak uji.
  participant_id uuid references public.participants(id) on delete cascade,
  jenis text not null,
  status text not null default 'antre',
  requested_by uuid references public.users(id) on delete set null,
  lane_id bigint references public.attendance_lanes(id) on delete set null,
  -- Token lease stasiun yang mengambil pekerjaan ini. Laporan hasil dengan
  -- token lain ditolak.
  lease_token uuid,
  galat text,
  created_at timestamptz not null default now(),
  diambil_at timestamptz,
  selesai_at timestamptz,
  constraint badge_cetak_jenis check (jenis in ('otomatis', 'ulang', 'uji')),
  constraint badge_cetak_status check (status in ('antre', 'diambil', 'terkirim', 'gagal', 'kedaluwarsa')),
  constraint badge_cetak_peserta check ((jenis = 'uji') = (participant_id is null))
);

-- Aturan 2: sekali otomatis per peserta per acara.
create unique index if not exists badge_cetak_otomatis_sekali
  on public.badge_cetak_antrean (event_id, participant_id) where jenis = 'otomatis';

create index if not exists badge_cetak_antrean_stasiun
  on public.badge_cetak_antrean (stasiun_id, status, created_at);

create index if not exists badge_cetak_antrean_peserta
  on public.badge_cetak_antrean (event_id, participant_id, created_at desc);

-- Berapa lama badge boleh menunggu stasiun sebelum kedaluwarsa. Setelan acara
-- karena antrean panjang setelah jaringan putus butuh batas yang berbeda.
alter table public.badge_settings
  add column if not exists cetak_kedaluwarsa_menit smallint not null default 10;
alter table public.badge_settings drop constraint if exists badge_settings_kedaluwarsa;
alter table public.badge_settings
  add constraint badge_settings_kedaluwarsa check (cetak_kedaluwarsa_menit in (5, 10, 30));

-- Tanpa policy: hanya service role (route handler) yang membaca dan menulis.
alter table public.badge_stasiun enable row level security;
alter table public.badge_cetak_antrean enable row level security;
revoke all on table public.badge_stasiun from public, anon, authenticated;
revoke all on table public.badge_cetak_antrean from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Klaim nama stasiun untuk laptop ini (token dibuat laptop, disimpan di tab).
--
-- Nama yang lease-nya masih dipegang token lain ditolak dengan 'dipakai',
-- kecuali p_ambil_alih: petugas menekan Ambil alih dengan sadar.
create or replace function public.badge_stasiun_klaim(
  p_event_id uuid,
  p_nama text,
  p_token uuid,
  p_ambil_alih boolean default false
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  s public.badge_stasiun;
begin
  insert into public.badge_stasiun (event_id, nama)
  values (p_event_id, btrim(p_nama))
  on conflict (event_id, lower(btrim(nama))) do nothing;

  select * into s from public.badge_stasiun
   where event_id = p_event_id and lower(btrim(nama)) = lower(btrim(p_nama))
   for update;

  if s.lease_token is not null and s.lease_token <> p_token
     and s.lease_until > now() and not p_ambil_alih then
    return jsonb_build_object('status', 'dipakai', 'stasiun_id', s.id, 'nama', s.nama, 'sejak', s.last_seen_at);
  end if;

  update public.badge_stasiun
     set lease_token = p_token, lease_until = now() + interval '15 seconds', last_seen_at = now()
   where id = s.id
  returning * into s;

  return jsonb_build_object('status', 'ok', 'stasiun_id', s.id, 'nama', s.nama, 'dijeda', s.dijeda);
end $$;

-- ---------------------------------------------------------------------------
-- Satu putaran polling stasiun: perpanjang lease, rapikan antrean, ambil satu.
--
-- Satu per satu: selama masih ada pekerjaan 'diambil' milik stasiun ini, tidak
-- ada yang diambil lagi. window.print() di kiosk memblok beberapa detik per
-- lembar, dan dua pekerjaan sekaligus tidak punya urutan keluar yang pasti.
create or replace function public.badge_cetak_ambil(
  p_event_id uuid,
  p_stasiun_id bigint,
  p_token uuid
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  s public.badge_stasiun;
  menit int;
  job public.badge_cetak_antrean;
begin
  select * into s from public.badge_stasiun
   where id = p_stasiun_id and event_id = p_event_id
   for update;
  if not found then
    return jsonb_build_object('status', 'tidak_ada');
  end if;
  -- Aturan 1: lease milik laptop lain, atau sudah lewat dan dipegang orang lain.
  if s.lease_token is distinct from p_token then
    return jsonb_build_object('status', 'lease_hilang', 'sejak', s.last_seen_at);
  end if;

  update public.badge_stasiun
     set lease_until = now() + interval '15 seconds', last_seen_at = now()
   where id = s.id;

  select coalesce((select cetak_kedaluwarsa_menit from public.badge_settings where event_id = p_event_id), 10)
    into menit;

  update public.badge_cetak_antrean
     set status = 'kedaluwarsa', selesai_at = now()
   where stasiun_id = s.id and status = 'antre'
     and created_at < now() - make_interval(mins => menit);

  -- Aturan 3.
  update public.badge_cetak_antrean
     set status = 'gagal', galat = 'macet', selesai_at = now()
   where stasiun_id = s.id and status = 'diambil'
     and diambil_at < now() - interval '60 seconds';

  if s.dijeda then
    return jsonb_build_object('status', 'dijeda');
  end if;

  if exists (select 1 from public.badge_cetak_antrean where stasiun_id = s.id and status = 'diambil') then
    return jsonb_build_object('status', 'sibuk');
  end if;

  select * into job from public.badge_cetak_antrean
   where stasiun_id = s.id and status = 'antre'
   order by created_at, id
   limit 1
   for update skip locked;
  if not found then
    return jsonb_build_object('status', 'kosong');
  end if;

  update public.badge_cetak_antrean
     set status = 'diambil', diambil_at = now(), lease_token = p_token
   where id = job.id
  returning * into job;

  return jsonb_build_object('status', 'ok', 'job', jsonb_build_object(
    'id', job.id, 'participant_id', job.participant_id, 'jenis', job.jenis, 'created_at', job.created_at));
end $$;

-- ---------------------------------------------------------------------------
-- Laporan stasiun: 'terkirim' (afterprint) atau 'gagal' (badge tidak bisa
-- disiapkan). Ditolak bila token bukan pemegang lease saat ini.
create or replace function public.badge_cetak_selesai(
  p_event_id uuid,
  p_job_id bigint,
  p_token uuid,
  p_hasil text,
  p_galat text default null
) returns boolean
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  if p_hasil not in ('terkirim', 'gagal') then
    raise exception 'HASIL_TIDAK_DIKENAL';
  end if;
  update public.badge_cetak_antrean a
     set status = p_hasil, galat = left(p_galat, 200), selesai_at = now()
    from public.badge_stasiun s
   where a.id = p_job_id and a.event_id = p_event_id and a.status = 'diambil'
     and a.lease_token = p_token
     and s.id = a.stasiun_id and s.lease_token = p_token;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ---------------------------------------------------------------------------
-- Antrekan badge. Dipanggil server di dalam permintaan scan / walk-in
-- ('otomatis'), atau dari tombol Cetak ulang ('ulang') dan Cetak uji ('uji').
--
-- 'otomatis' yang sudah pernah ada TIDAK membuat baris baru (aturan 2); yang
-- dikembalikan adalah pekerjaan lama, supaya HP bisa menulis "sudah terkirim".
create or replace function public.badge_cetak_antrekan(
  p_event_id uuid,
  p_stasiun_id bigint,
  p_participant_id uuid,
  p_jenis text,
  p_user uuid,
  p_lane_id bigint default null
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  job public.badge_cetak_antrean;
  baru boolean := true;
begin
  if not exists (select 1 from public.badge_stasiun where id = p_stasiun_id and event_id = p_event_id) then
    raise exception 'STASIUN_NOT_FOUND';
  end if;
  if p_participant_id is not null and not exists (
    select 1 from public.participants where id = p_participant_id and event_id = p_event_id
  ) then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  insert into public.badge_cetak_antrean (event_id, stasiun_id, participant_id, jenis, requested_by, lane_id)
  values (p_event_id, p_stasiun_id, p_participant_id, p_jenis, p_user, p_lane_id)
  on conflict (event_id, participant_id) where jenis = 'otomatis' do nothing
  returning * into job;

  if not found then
    baru := false;
    select * into job from public.badge_cetak_antrean
     where event_id = p_event_id and participant_id = p_participant_id and jenis = 'otomatis';
  end if;

  return jsonb_build_object('baru', baru, 'job_id', job.id);
end $$;

-- ---------------------------------------------------------------------------
-- Pindahkan pekerjaan yang MASIH antre ke stasiun lain (baris yang sama, bukan
-- baris baru: kalau Stasiun 1 hidup lagi, ia tidak ikut mencetak). Pekerjaan
-- yang sudah diambil tidak dipindah; pemanggil membaca statusnya dan
-- menampilkan "Sudah diambil Stasiun 1".
create or replace function public.badge_cetak_pindah(
  p_event_id uuid,
  p_job_id bigint,
  p_stasiun_id bigint
) returns boolean
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  if not exists (
    select 1 from public.badge_stasiun
     where id = p_stasiun_id and event_id = p_event_id and lease_until > now()
  ) then
    raise exception 'STASIUN_OFFLINE';
  end if;
  update public.badge_cetak_antrean
     set stasiun_id = p_stasiun_id
   where id = p_job_id and event_id = p_event_id and status = 'antre';
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function public.badge_stasiun_klaim(uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.badge_cetak_ambil(uuid, bigint, uuid) from public, anon, authenticated;
revoke all on function public.badge_cetak_selesai(uuid, bigint, uuid, text, text) from public, anon, authenticated;
revoke all on function public.badge_cetak_antrekan(uuid, bigint, uuid, text, uuid, bigint) from public, anon, authenticated;
revoke all on function public.badge_cetak_pindah(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.badge_stasiun_klaim(uuid, text, uuid, boolean) to service_role;
grant execute on function public.badge_cetak_ambil(uuid, bigint, uuid) to service_role;
grant execute on function public.badge_cetak_selesai(uuid, bigint, uuid, text, text) to service_role;
grant execute on function public.badge_cetak_antrekan(uuid, bigint, uuid, text, uuid, bigint) to service_role;
grant execute on function public.badge_cetak_pindah(uuid, bigint, bigint) to service_role;

comment on table public.badge_stasiun is
  'Laptop stasiun cetak badge per acara. Lease (lease_token, lease_until) memastikan satu nama hanya hidup di satu laptop.';
comment on table public.badge_cetak_antrean is
  'Antrean cetak badge kertas dari pemindai ke stasiun. Hanya participant_id; data peserta dibaca saat mencetak.';
