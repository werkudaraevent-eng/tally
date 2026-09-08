-- ---------------------------------------------------------------------------
-- Tamu walk-in: mendaftarkan orang yang datang tanpa pernah terdaftar, dari
-- layar pemindai, tanpa meninggalkan antrean.
--
-- ---- Masalah yang diperbaiki ----------------------------------------------
--
-- Layar pemindai punya dua jalur — QR dan pencarian nama — dan keduanya
-- berakhir di tempat yang sama ketika orangnya memang belum pernah ada di
-- daftar: "arahkan tamu ke meja panitia". Petugas yang membaca kalimat itu
-- SEDANG BERDIRI di meja panitia. Yang sebenarnya terjadi di lapangan adalah
-- panitia membuka tab admin di ponsel yang sama, mencari menu peserta, mengetik
-- kode QR karangan sendiri, lalu kembali ke /scan untuk memindainya — sementara
-- antrean di belakang tamu itu berhenti.
--
-- ---- Kenapa membuat peserta dan mencatat hadir harus SATU transaksi --------
--
-- Dipisah menjadi dua panggilan, jaringan venue yang putus di antaranya
-- meninggalkan peserta yang ada di daftar tetapi tidak ada di daftar hadir.
-- Tidak ada satu pun tanda di layar petugas bahwa itu terjadi, dan yang
-- menemukannya adalah panitia yang menghitung ulang tamu setelah acara selesai.
--
-- ---- Kenapa `walk_in_at`, bukan kolom `created_via` yang serba bisa --------
--
-- Godaannya adalah satu kolom bernilai 'import' | 'public' | 'manual' |
-- 'walkin'. Itu menuntut EMPAT jalur pembuatan peserta ikut diubah supaya
-- mengisinya dengan benar — save_participant, import_participants,
-- submit_event_registration, approve_event_registration — dan sampai keempatnya
-- diubah, kolom itu berisi nilai default yang salah untuk tiga di antaranya.
-- Kolom yang berbohong untuk sebagian barisnya lebih buruk daripada tidak ada:
-- laporan yang dibangun di atasnya terlihat benar dan tidak bisa dibantah.
--
-- Satu kolom stempel waktu yang HANYA ditulis di sini tidak punya masalah itu.
-- Null berarti bukan walk-in, dan itu benar untuk setiap baris yang sudah ada
-- tanpa perlu backfill yang menebak-nebak. Ia juga menjawab lebih banyak:
-- bukan cuma "berapa yang walk-in" tetapi "jam berapa mereka datang".
-- ---------------------------------------------------------------------------

alter table public.participants
  add column if not exists walk_in_at timestamptz;

comment on column public.participants.walk_in_at is
  'Diisi hanya oleh create_walkin_participant. Null = peserta ini sudah terdaftar sebelum hari-H.';

-- Parsial: sebagian besar baris bernilai null, dan indeks penuh atas kolom yang
-- 95% null hanya membesarkan tabel tanpa mempercepat kueri yang ada.
create index if not exists participants_walk_in_idx
  on public.participants (event_id, walk_in_at) where walk_in_at is not null;

-- ---------------------------------------------------------------------------
-- Izin per acara, default MATI.
--
-- Ini kewenangan baru yang serius: role `scanner` adalah akun paling sempit di
-- sistem — dibuat justru supaya satu ponsel yang dipakai bergantian di pintu
-- masuk tidak bisa membuka transaksi dan data peserta — dan fitur ini
-- memberinya kemampuan MEMBUAT peserta. Acara yang sudah berjalan tidak boleh
-- mendapatkannya diam-diam karena sebuah migrasi dijalankan.
--
-- Sebagian acara juga memang melarang walk-in: katering dihitung pasti, kursi
-- bernomor, tamu negara. Di sana tombolnya harus benar-benar tidak ada, bukan
-- ada tetapi "jangan dipakai".
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists attendance_allow_walk_in boolean not null default false;

comment on column public.events.attendance_allow_walk_in is
  'true = petugas /scan boleh mendaftarkan tamu yang belum terdaftar. Default false.';

-- ---------------------------------------------------------------------------
-- Membuat peserta walk-in sekaligus mencatat kehadirannya.
--
-- Jawabannya sengaja berbentuk SAMA dengan record_attendance_scan: layar
-- pemindai sudah punya satu bidang hasil yang membedakan tercatat / sudah
-- pernah / tidak dikenal, dan jawaban berbentuk lain akan menuntut cabang
-- render kedua yang menampilkan hal yang sama dengan cara berbeda.
--
-- ---- Rem duplikat ada di sini, bukan hanya di layar ------------------------
--
-- Layar sudah memaksa petugas mencari lebih dulu — tombolnya hanya muncul di
-- hasil pencarian yang kosong. Itu menahan kesalahan yang disengaja, bukan yang
-- tidak: ketukan ganda pada tombol simpan, dan nama yang ditulis sedikit
-- berbeda dari yang sudah ada ("Budi  Santoso" dengan dua spasi menghasilkan
-- pencarian kosong yang meyakinkan).
--
-- Karena itu pemeriksaan nama diulang di dalam transaksi. Bila ada yang mirip,
-- fungsi ini TIDAK MENULIS APA PUN dan mengembalikan daftar kandidatnya;
-- petugas melihat orangnya, lalu memutuskan sendiri — memilih yang sudah ada,
-- atau menegaskan bahwa ini memang orang lain (`p_force`).
-- ---------------------------------------------------------------------------
create or replace function public.create_walkin_participant(
  p_event_id uuid,
  p_session_id bigint,
  p_name text,
  p_company text default null,
  p_title text default null,
  p_email text default null,
  p_phone text default null,
  p_extra jsonb default null,
  p_user uuid default null,
  p_lane_id bigint default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  boleh boolean;
  sesi public.attendance_sessions;
  jalur public.attendance_lanes;
  peserta public.participants;
  -- Spasi berlebih DIRAPIKAN, bukan sekadar dipotong di ujung. Nama diketik di
  -- ponsel yang dipegang satu tangan di depan antrean, dan spasi ganda di
  -- tengahnya tidak terlihat di kolom isian. Dibiarkan, ia tersimpan permanen —
  -- lalu pencarian nama pada pemindaian berikutnya tidak menemukannya, dan
  -- pemeriksaan kembar di bawah ini membandingkan bentuk yang sudah dirapikan
  -- dengan bentuk tersimpan yang tidak.
  v_name text := nullif(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_kunci text;
  v_qr text;
  kandidat jsonb;
  unik int;
begin
  if p_event_id is null then
    raise exception using errcode='P0009', message='EVENT_REQUIRED';
  end if;

  select attendance_allow_walk_in into boleh from public.events where id = p_event_id;
  if boleh is null then
    raise exception using errcode='P0009', message='EVENT_REQUIRED';
  end if;
  if not boleh then
    raise exception 'WALKIN_DISABLED';
  end if;

  if v_name is null then
    raise exception 'PARTICIPANT_FIELDS_REQUIRED';
  end if;
  if p_extra is not null and jsonb_typeof(p_extra) <> 'object' then
    raise exception 'PARTICIPANT_EXTRA_INVALID';
  end if;

  select * into sesi from public.attendance_sessions
   where id = p_session_id and event_id = p_event_id;
  if sesi.id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if not sesi.is_active then
    raise exception 'SESSION_CLOSED';
  end if;

  if p_lane_id is not null then
    select * into jalur from public.attendance_lanes
     where id = p_lane_id and event_id = p_event_id;
    if jalur.id is null then
      raise exception 'LANE_NOT_FOUND';
    end if;
  end if;

  -- Huruf besar-kecil disamakan sebelum dibandingkan; spasinya sudah dirapikan
  -- saat v_name dihitung. Nama yang diketik ulang di depan antrean nyaris tidak
  -- pernah identik byte per byte dengan nama yang diketik operator entri data
  -- tiga minggu sebelumnya.
  v_kunci := lower(v_name);

  if not p_force then
    select jsonb_agg(baris order by baris->>'name') into kandidat
      from (
        select jsonb_build_object(
                 'id', p.id,
                 'name', p.name,
                 'company', p.company,
                 'title', p.title,
                 'qr_code', p.qr_code,
                 'scan_count', (
                   select count(*) from public.attendance_scans s
                    where s.session_id = p_session_id and s.participant_id = p.id
                 )
               ) as baris
          from public.participants p
         where p.event_id = p_event_id
           and p.source_removed_at is null
           and lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) = v_kunci
         limit 5
      ) sub;

    if kandidat is not null then
      -- Tanpa satu pun penulisan. Petugas yang menekan tombol dua kali karena
      -- jaringan lambat tidak boleh menghasilkan orang kedua.
      return jsonb_build_object('status', 'possible_duplicate', 'candidates', kandidat);
    end if;
  end if;

  v_qr := public.generate_registration_qr(p_event_id);

  insert into public.participants
    (event_id, qr_code, name, company, title, email, phone, extra, walk_in_at)
  values
    (p_event_id, v_qr, v_name, v_company, v_title, v_email, v_phone, coalesce(p_extra, '{}'::jsonb), now())
  returning * into peserta;

  -- is_duplicate selalu false: barisnya baru dibuat pada pernyataan sebelumnya,
  -- jadi tidak mungkin ia sudah pernah dipindai di sesi mana pun.
  insert into public.attendance_scans
    (event_id, session_id, participant_id, scanned_by, is_duplicate, lane_id)
  values
    (p_event_id, p_session_id, peserta.id, p_user, false, p_lane_id);

  select count(distinct participant_id) into unik
    from public.attendance_scans where session_id = p_session_id;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_user, 'participant_walkin_created',
          jsonb_build_object('participant_id', peserta.id, 'qr_code', peserta.qr_code,
                             'name', peserta.name, 'session_id', p_session_id,
                             'lane_id', p_lane_id, 'forced', p_force));

  return jsonb_build_object(
    'status', 'created',
    'participant', jsonb_build_object(
      'id', peserta.id,
      'name', peserta.name,
      'company', peserta.company,
      'title', peserta.title,
      'qr_code', peserta.qr_code
    ),
    'first_scan_at', now(),
    'scan_count', 1,
    'session_unique_total', unik
  );
end $$;

revoke all on function public.create_walkin_participant(uuid, bigint, text, text, text, text, text, jsonb, uuid, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.create_walkin_participant(uuid, bigint, text, text, text, text, text, jsonb, uuid, bigint, boolean)
  to service_role;
