-- Pengecualian peserta dari leaderboard top spender.
--
-- Permintaan klien: perusahaan internal klien TIDAK BERHAK ikut top spender.
-- Bisa dikecualikan per perusahaan, bisa per orang.
--
-- =========================================================================
-- KENAPA TABEL SENDIRI, BUKAN KOLOM DI display_settings
-- =========================================================================
-- Sempat dirancang sebagai `display_settings.excluded_companies text[]`, dan itu
-- keliru. Klien menyebut "tidak berhak", bukan "jangan ditampilkan" — ini aturan
-- KELAYAKAN, bukan setelan tampilan.
--
-- Bedanya bukan soal rasa. `display_settings` diedit lewat satu form panjang
-- dengan tombol Simpan, sehingga daftar diskualifikasi akan ikut terkirim setiap
-- kali ada yang mengubah warna latar — dan sebaliknya, menambah satu perusahaan
-- ke daftar akan menerbitkan perubahan warna yang belum selesai. Alasan yang
-- sama membuat `leaderboard_reveal` dan `undian_state` dipisah dari tabel
-- konfigurasinya masing-masing.
--
-- Bentuk array juga tidak menyediakan tempat untuk alasan, pembuat, waktu, dan
-- saklar aktif per baris. Padahal "kenapa perusahaan ini gugur" adalah
-- pertanyaan yang pasti muncul setelah acara.
--
-- =========================================================================
-- KENAPA SATU TABEL UNTUK DUA SASARAN (perusahaan & orang)
-- =========================================================================
-- Undian memisahkan `undian_exclusion_rules` (pohon syarat) dari
-- `undian_exclusions` (satu peserta) karena bentuk datanya memang jauh berbeda.
-- Di sini keduanya sama sederhana: satu kata kunci teks, atau satu id peserta.
-- Dipecah dua tabel berarti dua endpoint, dua daftar di layar, dan dua tempat
-- yang harus dibaca untuk menjawab "siapa saja yang gugur".
--
-- Yang menjaga integritasnya adalah CHECK: tepat SATU kolom sasaran boleh diisi.
-- Baris dengan dua-duanya terisi tidak punya arti tunggal, dan baris tanpa
-- keduanya adalah aturan yang tidak menunjuk siapa pun.
create table if not exists public.leaderboard_exclusions (
  id serial primary key,

  -- Kata kunci perusahaan. Dicocokkan dengan `contains`, case-insensitive,
  -- setelah di-trim. BUKAN perbandingan persis.
  --
  -- Data nyata di tabel participants saat migrasi ini ditulis:
  --   "PT Rintis Sejahtera"   35 peserta
  --   "PT. Rintis Sejahtera"  14 peserta
  -- Perbandingan persis pada satu string menangkap 35 dan MELOLOSKAN 14. Empat
  -- belas orang tetap naik papan sementara panitia mengira sudah dikecualikan,
  -- dan itu baru ketahuan saat namanya muncul di proyektor.
  company_keyword text,

  -- Sasaran per orang. ON DELETE CASCADE aman di sini: baris ini hanya berisi
  -- aturan, bukan bukti apa pun. Berbeda dengan undian_winners.session_id yang
  -- sengaja SET NULL karena catatan pemenang tidak boleh ikut terhapus.
  participant_id uuid references public.participants(id) on delete cascade,

  reason text,

  -- Saklar per baris. Menonaktifkan lebih baik daripada menghapus ketika klien
  -- ragu di hari-H: keputusannya bisa dibalik dalam satu klik tanpa kehilangan
  -- catatan siapa yang pernah memasukkannya dan kenapa.
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  created_by uuid references public.users(id),

  constraint leaderboard_exclusions_one_target check (
    (company_keyword is not null and participant_id is null)
    or (company_keyword is null and participant_id is not null)
  ),

  -- PALING PENTING DI BERKAS INI.
  --
  -- `position('' in apa_pun) = 1`, jadi kata kunci kosong cocok dengan SEMUA
  -- perusahaan dan mengosongkan seluruh papan — diam-diam, tanpa satu pun galat.
  -- Ini persis jebakan yang pernah terjadi pada normalizeConditions undian:
  -- masukan tak sah yang justru MEMBALIK arti aturan.
  --
  -- Batas 2 karakter, bukan 1: kata kunci "a" cocok dengan hampir setiap nama
  -- perusahaan Indonesia. Lolos CHECK tapi hasilnya sama saja dengan kosong.
  constraint leaderboard_exclusions_keyword_usable check (
    company_keyword is null or length(btrim(company_keyword)) >= 2
  )
);

-- Kata kunci kembar tidak menambah efek apa pun, hanya membuat daftar di layar
-- terbaca seolah ada dua aturan berbeda. Dinormalkan sama dengan cara
-- pencocokannya (lower + btrim), supaya "Rintis" dan " rintis " dianggap satu.
create unique index if not exists leaderboard_exclusions_keyword_unique
  on public.leaderboard_exclusions (lower(btrim(company_keyword)))
  where company_keyword is not null;

create unique index if not exists leaderboard_exclusions_participant_unique
  on public.leaderboard_exclusions (participant_id)
  where participant_id is not null;

-- =========================================================================
-- Pencocokan: SATU definisi, dipakai bersama
-- =========================================================================
-- Dipakai oleh get_leaderboard (yang menentukan papan) DAN oleh fungsi pratinjau
-- di CMS. Kalau ekspresinya disalin, angka "cocok N peserta" di layar admin bisa
-- berbeda dari yang benar-benar tersaring — dan yang salah justru yang dipercaya
-- panitia saat memutuskan.
--
-- `p_company is not null` disengaja: perusahaan kosong berarti TIDAK DIKETAHUI,
-- dan menggugurkan orang yang datanya kosong karena sebuah kata kunci adalah
-- tuduhan tanpa dasar.
create or replace function public.leaderboard_is_excluded(
  p_participant_id uuid,
  p_company text
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.leaderboard_exclusions x
    where x.is_active
      and (
        -- Bernilai NULL (bukan true) saat participant_id kosong, sehingga baris
        -- kata kunci tidak pernah tersangkut di cabang ini.
        x.participant_id = p_participant_id
        or (
          x.company_keyword is not null
          and p_company is not null
          and position(lower(btrim(x.company_keyword)) in lower(btrim(p_company))) > 0
        )
      )
  );
$function$;

-- =========================================================================
-- get_leaderboard: saring SEBELUM row_number(), SEBELUM limit
-- =========================================================================
-- Definisi lain di berkas ini TIDAK BERUBAH sedikit pun dari
-- 202607290001_separate_display_name_from_company.sql. Yang ditambahkan hanya
-- satu baris `and not public.leaderboard_is_excluded(...)` di dalam CTE totals.
--
-- Letak baris itu yang menentukan benar atau salahnya seluruh fitur:
--
-- 1. SEBELUM row_number(). Menyaring setelahnya membuat papan berlubang —
--    1, 2, 4, 5, 7 — dan MC ditanya penonton siapa yang nomor 3. Itu lebih buruk
--    daripada tidak menyaring sama sekali, karena kehilangannya justru menjadi
--    pengumuman.
--
-- 2. SEBELUM limit. Top 15 saat ini memuat 7 orang dari satu perusahaan; menyaring
--    setelah `limit 10` menyisakan 4 baris di papan yang disetel 10.
--
-- 3. DI DALAM RPC, bukan di route handler. Tiga endpoint publik memanggil fungsi
--    ini — /api/leaderboard, /api/display/leaderboard, /api/display/reveal.
--    Menyaring di route berarti tiga tempat yang harus diingat, dan yang terlupa
--    tidak menggagalkan build: ia hanya menyiarkan nama yang diminta digugurkan.
--
-- Yang SENGAJA tidak ikut tersaring: /api/admin/reports tidak memanggil fungsi
-- ini. Peserta yang gugur tetap terhitung penuh di laporan, dan itu memang benar
-- — belanjanya nyata dan uangnya masuk. Yang gugur hanya lombanya.
create or replace function public.get_leaderboard(p_limit integer default 10)
returns table(rank bigint, display_name text, company text, total_spent bigint, booth_count bigint)
language sql
security definer
set search_path to 'public'
as $function$
  with totals as (
    select p.id, p.name, p.company, p.allow_name_display,
           sum(o.regular_amount)::bigint as total_spent,
           count(distinct o.booth_id)::bigint as booth_count,
           row_number() over(
             order by sum(o.regular_amount) desc,
                      count(distinct o.booth_id) desc,
                      p.name
           ) as rank
    from public.participants p
    join public.orders o on o.participant_id = p.id
    where o.status in ('paid', 'handed_over')
      and not public.leaderboard_is_excluded(p.id, p.company)
    group by p.id, p.name, p.company, p.allow_name_display
  ), settings as (
    select name_display_mode from public.event_settings where id = 1
  )
  select
    t.rank,
    case
      when not t.allow_name_display
        then regexp_replace(t.name, '([[:alpha:]])[^ ]*', '\1.', 'g')
      when s.name_display_mode = 'full' then t.name
      when s.name_display_mode = 'initials'
        then regexp_replace(t.name, '([[:alpha:]])[^ ]*', '\1.', 'g')
      when s.name_display_mode = 'company_only'
        then coalesce(t.company, 'Peserta #' || t.rank)
      else 'Peserta #' || t.rank
    end as display_name,
    case
      when s.name_display_mode in ('company_only', 'hidden') then null
      else t.company
    end as company,
    t.total_spent,
    t.booth_count
  from totals t
  cross join settings s
  order by t.rank
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$function$;

-- =========================================================================
-- Pratinjau dampak untuk CMS
-- =========================================================================
-- Aturan yang cocok dengan NOL orang hampir selalu berarti salah ketik, dan itu
-- satu-satunya peringatan yang tersedia sebelum acara dimulai. Karena itu
-- angkanya ditampilkan per baris, bukan disembunyikan.
--
-- Dua angka, bukan satu: `matched_participants` menjawab "siapa yang terkena",
-- `matched_spenders` menjawab "berapa yang sebenarnya ada di papan". Aturan bisa
-- saja cocok dengan 35 orang tapi hanya 12 yang punya transaksi lunas — dan 12
-- itulah yang benar-benar hilang dari layar.
create or replace function public.leaderboard_exclusion_impact()
returns table(id int, matched_participants bigint, matched_spenders bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    x.id,
    count(p.id)::bigint,
    count(p.id) filter (where s.participant_id is not null)::bigint
  from public.leaderboard_exclusions x
  left join public.participants p
    on (
      x.participant_id = p.id
      or (
        x.company_keyword is not null
        and p.company is not null
        and position(lower(btrim(x.company_keyword)) in lower(btrim(p.company))) > 0
      )
    )
  left join (
    select distinct o.participant_id
    from public.orders o
    where o.status in ('paid', 'handed_over')
  ) s on s.participant_id = p.id
  group by x.id;
$function$;

-- Ringkasan papan: berapa peserta berbelanja seluruhnya, berapa yang gugur, dan
-- berapa yang tersisa.
--
-- `remaining` ada supaya CMS bisa memperingatkan sebelum papan menjadi lebih
-- pendek daripada `leaderboard_limit`, atau bahkan kosong. Papan kosong di
-- proyektor hanya menampilkan "Belum ada transaksi lunas." — kalimat yang
-- terbaca sebagai sistem rusak, padahal penyebabnya sebuah aturan yang baru saja
-- ditambahkan sendiri oleh panitia.
create or replace function public.leaderboard_exclusion_summary()
returns table(total_spenders bigint, excluded_spenders bigint, remaining_spenders bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with spenders as (
    select p.id, p.company
    from public.participants p
    where exists (
      select 1 from public.orders o
      where o.participant_id = p.id and o.status in ('paid', 'handed_over')
    )
  )
  select
    count(*)::bigint,
    count(*) filter (where public.leaderboard_is_excluded(id, company))::bigint,
    count(*) filter (where not public.leaderboard_is_excluded(id, company))::bigint
  from spenders;
$function$;

-- =========================================================================
-- Keamanan: pola seluruh repo
-- =========================================================================
-- RLS menyala tanpa satu pun policy; semua akses lewat route handler yang
-- memakai service role.
alter table public.leaderboard_exclusions enable row level security;

revoke all on table public.leaderboard_exclusions from anon, authenticated;
-- Sequence ikut dicabut: tabel terkunci dengan sequence terbuka masih
-- membocorkan laju pertumbuhan datanya.
revoke all on sequence public.leaderboard_exclusions_id_seq from anon, authenticated;

revoke all on function public.leaderboard_is_excluded(uuid, text) from public, anon, authenticated;
grant execute on function public.leaderboard_is_excluded(uuid, text) to service_role;

revoke all on function public.leaderboard_exclusion_impact() from public, anon, authenticated;
grant execute on function public.leaderboard_exclusion_impact() to service_role;

revoke all on function public.leaderboard_exclusion_summary() from public, anon, authenticated;
grant execute on function public.leaderboard_exclusion_summary() to service_role;

-- get_leaderboard didefinisikan ulang, jadi hak aksesnya ditegakkan lagi. CREATE
-- OR REPLACE mempertahankan grant yang ada, tetapi menuliskannya kembali membuat
-- berkas ini benar walau dijalankan di database yang masih kosong.
revoke all on function public.get_leaderboard(integer) from public, anon, authenticated;
grant execute on function public.get_leaderboard(integer) to service_role;

-- =========================================================================
-- Dokumentasi kolom yang mudah disalahpahami
-- =========================================================================
comment on table public.leaderboard_exclusions is
  'Peserta/perusahaan yang TIDAK BERHAK masuk top spender (mis. perusahaan internal klien). Aturan kelayakan, bukan setelan tampilan — karena itu tidak ditaruh di display_settings. Ditegakkan di dalam get_leaderboard sebelum row_number() dan sebelum limit, sehingga peringkat tetap rapat 1..N dan ketiga endpoint publik ikut otomatis.';
comment on column public.leaderboard_exclusions.company_keyword is
  'Kata kunci, dicocokkan contains + case-insensitive + trim. BUKAN perbandingan persis: data nyata memuat "PT Rintis Sejahtera" (35 orang) sekaligus "PT. Rintis Sejahtera" (14 orang), dan perbandingan persis meloloskan yang kedua tanpa ada yang menyadarinya.';
comment on column public.leaderboard_exclusions.is_active is
  'false = aturan tidak berlaku tapi catatannya tetap ada. Membalikkan keputusan di hari-H tidak boleh menuntut penghapusan baris beserta alasan dan pembuatnya.';
comment on function public.leaderboard_is_excluded(uuid, text) is
  'Satu-satunya definisi pencocokan. Dipakai get_leaderboard dan fungsi pratinjau CMS supaya angka yang dilihat admin tidak pernah berbeda dari yang benar-benar tersaring.';
