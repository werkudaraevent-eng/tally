-- ---------------------------------------------------------------------------
-- Jalur registrasi, dan pemasangan layar sapa ke satu jalur.
--
-- ---- Masalah yang diperbaiki ----------------------------------------------
--
-- Acara besar membuka beberapa jalur registrasi berdampingan: lima meja, lima
-- ponsel petugas, lima TV. Sampai sekarang layar sapa menampilkan SELURUH
-- pemindaian acara, jadi kelima TV memajang nama yang sama — termasuk nama tamu
-- yang sedang berdiri di meja lain, enam meter jauhnya.
--
-- ---- Kenapa jalur BUKAN sesi kehadiran -------------------------------------
--
-- Godaannya adalah membuat lima sesi bernama "Registrasi 1".."Registrasi 5".
-- Itu merusak angka yang paling sering ditanyakan panitia: jumlah hadir dihitung
-- per SESI, jadi satu acara akan melaporkan lima angka registrasi yang harus
-- dijumlahkan sendiri — dan satu orang yang mengantre di jalur yang salah lalu
-- pindah akan terhitung dua kali tanpa ada yang bisa melihatnya.
--
-- Jalur adalah TEMPAT, sesi adalah TAHAP. Keduanya tegak lurus: lima jalur
-- melayani satu sesi "Registrasi", dan sesi "Makan siang" nanti bisa memakai dua
-- jalur yang sama sekali berbeda. Karena itu jalur menjadi dimensi tersendiri
-- pada baris pemindaian, bukan nilai lain di kolom sesi.
--
-- ---- Kenapa jalur bukan sekadar "akun petugas" -----------------------------
--
-- `attendance_scans.scanned_by` sudah ada, dan menyaring layar berdasarkan akun
-- terlihat gratis. Ia salah di lapangan: satu akun "petugas scan" lazim dipakai
-- bergantian di beberapa ponsel, sementara satu meja bisa berganti tiga petugas
-- dalam satu pagi. Akun adalah ORANG; jalur adalah MEJA. Yang harus diikuti
-- layar di atas meja adalah mejanya.
--
-- Ini juga model yang dipakai perangkat lunak registrasi besar: stasiun adalah
-- entitas yang bisa diberi nama dan disetel sendiri, terpisah dari siapa yang
-- sedang berdiri di belakangnya.
-- ---------------------------------------------------------------------------

create table if not exists public.attendance_lanes (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  -- Dipakai di alamat layar (`/sapa?jalur=meja-1`) untuk layar yang disetel
  -- lewat URL, bukan lewat kode pemasangan.
  slug text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint attendance_lanes_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint attendance_lanes_slug_unique unique (event_id, slug)
);

alter table public.attendance_lanes enable row level security;

-- Nullable, dan itu disengaja.
--
-- Acara satu meja tidak perlu mengenal jalur sama sekali, dan seluruh
-- pemindaian yang sudah tercatat sebelum migrasi ini tidak punya jalur untuk
-- diisikan. NOT NULL akan menuntut jalur "Umum" bohongan yang harus dibuat di
-- setiap acara hanya supaya kolomnya terisi.
alter table public.attendance_scans
  add column if not exists lane_id bigint references public.attendance_lanes(id) on delete set null;

-- Layar sapa menyaring per jalur dan mengurutkan waktu. Tanpa indeks ini setiap
-- TV membaca seluruh pemindaian acara lalu membuang yang bukan jalurnya, setiap
-- dua detik, sepanjang hari.
create index if not exists attendance_scans_lane_time_idx
  on public.attendance_scans (lane_id, scanned_at desc);

-- ---------------------------------------------------------------------------
-- Layar sapa yang terdaftar, beserta kode pemasangannya.
--
-- ---- Kenapa kode pemasangan, bukan URL per layar ---------------------------
--
-- Alternatifnya adalah mengetik `/e/<slug>/sapa?jalur=meja-3` di tiap TV. Itu
-- berarti mengetik alamat panjang dengan remote TV, lima kali, sambil berdiri di
-- atas kursi — dan mengulanginya setiap kali susunan meja berubah.
--
-- Pola yang dipakai perangkat lunak digital signage membalik arahnya: layar
-- menampilkan kode pendek, dan orang yang MELIHAT kode itu mengklaimnya dari
-- perangkat yang punya papan ketik sungguhan. Kepemilikan kode — dibuktikan
-- dengan berdiri di depan layarnya — itulah izinnya.
--
-- Di sini yang mengklaim adalah petugas di jalur itu lewat /scan, bukan admin di
-- ruang kontrol. Yang tahu TV ini melayani meja yang mana adalah orang yang
-- berdiri di sebelahnya.
--
-- Enam digit, bukan enam karakter alfanumerik: kode ini dibaca dari seberang
-- meja, dan angka tidak punya pasangan yang tertukar seperti O/0, I/1, dan S/5.
-- ---------------------------------------------------------------------------
create table if not exists public.greeting_screens (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,

  -- Dibangkitkan browser TV lalu disimpan di localStorage-nya. Inilah yang
  -- membuat layar tetap terpasang setelah dimuat ulang, dan yang membuat satu TV
  -- tidak menumpuk baris baru setiap kali listrik berkedip.
  device_token uuid not null unique,

  -- Null setelah diklaim: kode yang tetap hidup setelah dipakai bisa diklaim
  -- ulang oleh siapa pun yang sempat memotretnya.
  pairing_code text,
  pairing_expires_at timestamptz,

  lane_id bigint references public.attendance_lanes(id) on delete set null,
  claimed_at timestamptz,
  claimed_by uuid references public.users(id) on delete set null,

  -- Dipakai admin untuk melihat TV mana yang sudah mati sejak setengah jam lalu.
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint greeting_screens_code_format check (pairing_code is null or pairing_code ~ '^[0-9]{6}$')
);

-- Unik hanya di antara kode yang masih hidup. Kode yang sudah dipakai menjadi
-- NULL, dan NULL tidak bertabrakan di indeks unik — jadi angka yang sama boleh
-- muncul lagi berbulan-bulan kemudian tanpa perlu daftar riwayat.
create unique index if not exists greeting_screens_pairing_code_idx
  on public.greeting_screens (pairing_code) where pairing_code is not null;

create index if not exists greeting_screens_event_idx
  on public.greeting_screens (event_id, last_seen_at desc);

alter table public.greeting_screens enable row level security;
-- Tanpa policy: seluruh akses lewat service role di route handler.

-- ---------------------------------------------------------------------------
-- Denyut layar sapa.
--
-- Satu fungsi, bukan tiga kueri dari route handler, karena layar ini memanggil
-- endpointnya setiap dua detik sepanjang acara. Yang mahal bukan membacanya,
-- melainkan MENULISNYA: `last_seen_at` yang diperbarui pada setiap denyut
-- menghasilkan satu penulisan per layar per dua detik — lima TV berarti sembilan
-- ribu penulisan per jam untuk satu kolom yang tidak ada yang lihat lebih sering
-- daripada sekali semenit.
--
-- Karena itu penulisannya bersyarat: hanya bila catatan terakhir sudah lewat
-- 30 detik, atau bila kodenya memang perlu dibuat/diputar.
-- ---------------------------------------------------------------------------
create or replace function public.touch_greeting_screen(
  p_event_id uuid,
  p_device uuid
)
returns public.greeting_screens
language plpgsql
security definer
set search_path = public
as $$
declare
  layar public.greeting_screens;
  kode text;
begin
  select * into layar from public.greeting_screens
   where device_token = p_device and event_id = p_event_id;

  if layar.id is null then
    -- Enam digit acak. Tabrakan ditangani indeks unik lewat `on conflict`, bukan
    -- dengan memeriksa lebih dulu: pemeriksaan-lalu-menulis punya celah di
    -- antaranya, dan dua TV yang dinyalakan bersamaan adalah persis keadaan yang
    -- membuka celah itu.
    loop
      kode := lpad((floor(random() * 1000000))::int::text, 6, '0');
      begin
        insert into public.greeting_screens (event_id, device_token, pairing_code, pairing_expires_at)
        values (p_event_id, p_device, kode, now() + interval '15 minutes')
        returning * into layar;
        exit;
      exception when unique_violation then
        -- Tabrakan `device_token` berarti layar ini sudah terdaftar oleh
        -- permintaan lain yang datang bersamaan; ambil barisnya dan sudah.
        select * into layar from public.greeting_screens
         where device_token = p_device and event_id = p_event_id;
        if layar.id is not null then exit; end if;
        -- Selain itu berarti angkanya yang bertabrakan: ulangi dengan angka lain.
      end;
    end loop;
    return layar;
  end if;

  -- Kode yang kedaluwarsa dan belum diklaim diputar. Kode yang menempel di layar
  -- sepanjang hari cukup difoto sekali untuk dibajak kapan saja sesudahnya.
  if layar.lane_id is null and (layar.pairing_code is null or layar.pairing_expires_at < now()) then
    loop
      kode := lpad((floor(random() * 1000000))::int::text, 6, '0');
      begin
        update public.greeting_screens
           set pairing_code = kode,
               pairing_expires_at = now() + interval '15 minutes',
               last_seen_at = now()
         where id = layar.id
        returning * into layar;
        exit;
      exception when unique_violation then
        -- angka bertabrakan; ulangi
      end;
    end loop;
    return layar;
  end if;

  if layar.last_seen_at < now() - interval '30 seconds' then
    update public.greeting_screens set last_seen_at = now()
     where id = layar.id returning * into layar;
  end if;

  return layar;
end $$;

revoke all on function public.touch_greeting_screen(uuid, uuid) from public, anon, authenticated;
grant execute on function public.touch_greeting_screen(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Pencatatan pemindaian, kini membawa jalur.
--
-- Fungsi lama DIHAPUS lalu dibuat ulang, bukan ditambah parameter berdefault.
-- Menambah parameter menghasilkan fungsi KEDUA dengan tanda tangan berbeda, dan
-- panggilan berargumen empat menjadi ambigu di antara keduanya — Postgres
-- menolaknya saat dipanggil, bukan saat dibuat, jadi kegagalannya baru muncul
-- pada pemindaian pertama di hari-H.
-- ---------------------------------------------------------------------------
drop function if exists public.record_attendance_scan(uuid, bigint, text, uuid);

create or replace function public.record_attendance_scan(
  p_event_id uuid,
  p_session_id bigint,
  p_qr text,
  p_user uuid default null,
  p_lane_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sesi public.attendance_sessions;
  jalur public.attendance_lanes;
  peserta public.participants;
  sudah int;
  pertama timestamptz;
  unik int;
begin
  select * into sesi from public.attendance_sessions
   where id = p_session_id and event_id = p_event_id;
  if sesi.id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if not sesi.is_active then
    raise exception 'SESSION_CLOSED';
  end if;

  -- Jalur diperiksa di sini, di dalam transaksi yang sama, bukan lewat kueri
  -- tambahan dari route handler. Nomornya datang dari ponsel petugas, dan jalur
  -- milik acara lain yang lolos akan membuat pemindaian tercatat pada meja yang
  -- tidak ada di ruangan ini.
  if p_lane_id is not null then
    select * into jalur from public.attendance_lanes
     where id = p_lane_id and event_id = p_event_id;
    if jalur.id is null then
      raise exception 'LANE_NOT_FOUND';
    end if;
  end if;

  -- Peserta yang sudah dihapus di sumber TIDAK boleh tercatat hadir: namanya
  -- sudah dibatalkan panitia pusat, dan mencatatnya membuat daftar hadir
  -- berbeda dari daftar peserta.
  select * into peserta from public.participants
   where event_id = p_event_id
     and qr_code = btrim(p_qr)
     and source_removed_at is null;

  if peserta.id is null then
    return jsonb_build_object('status', 'not_found', 'qr', btrim(p_qr));
  end if;

  select count(*), min(scanned_at) into sudah, pertama
    from public.attendance_scans
   where session_id = p_session_id and participant_id = peserta.id;

  insert into public.attendance_scans (event_id, session_id, participant_id, scanned_by, is_duplicate, lane_id)
  values (p_event_id, p_session_id, peserta.id, p_user, sudah > 0, p_lane_id);

  select count(distinct participant_id) into unik
    from public.attendance_scans where session_id = p_session_id;

  return jsonb_build_object(
    'status', case when sudah > 0 then 'duplicate' else 'recorded' end,
    'participant', jsonb_build_object(
      'id', peserta.id,
      'name', peserta.name,
      'company', peserta.company,
      'title', peserta.title,
      'qr_code', peserta.qr_code
    ),
    'first_scan_at', pertama,
    'scan_count', sudah + 1,
    'session_unique_total', unik
  );
end $$;

revoke all on function public.record_attendance_scan(uuid, bigint, text, uuid, bigint) from public, anon, authenticated;
grant execute on function public.record_attendance_scan(uuid, bigint, text, uuid, bigint) to service_role;
