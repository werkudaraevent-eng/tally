-- ---------------------------------------------------------------------------
-- Pengecualian undian berbasis ATURAN, bukan hanya per orang.
--
-- Bentuk sebelumnya (`undian_exclusions`) menuntut panitia mencari satu per satu
-- di antara 248 peserta. Untuk "semua orang dari PT PRIMA" itu berarti membuka
-- daftar peserta, memindai kolom perusahaan dengan mata, dan menekan 14 tombol —
-- lalu mengulanginya setiap kali sinkronisasi Scanner API menambah peserta baru.
-- Satu yang terlewat berarti nama panitia keluar sebagai pemenang di atas panggung.
--
-- Aturan menyelesaikan keduanya: ia dievaluasi ULANG pada setiap undian, jadi
-- peserta yang baru masuk sesudah aturan dibuat ikut tersaring tanpa ada yang
-- perlu ingat memperbaruinya.
--
-- Keduanya tetap ada dan saling melengkapi:
--   * ATURAN     untuk yang punya pola ("perusahaan mengandung PRIMA").
--   * PER ORANG  untuk yang tidak ("Pak Budi kebetulan jadi MC malam ini").
-- Memaksa salah satunya menangani keduanya akan berakhir dengan aturan
-- berisi tujuh klausa `nama sama dengan ...`, yang tidak lain adalah daftar
-- per orang yang ditulis dengan cara yang lebih sulit dibaca.
-- ---------------------------------------------------------------------------

create table if not exists public.undian_exclusion_rules (
  id serial primary key,

  -- Label untuk manusia, mis. "Panitia & MC". Bukan hiasan: daftar aturan yang
  -- hanya menampilkan syaratnya memaksa pembaca menerjemahkan ulang maksudnya
  -- setiap kali, dan pada hari acara tidak ada waktu untuk itu.
  name text not null,
  note text,

  -- Pohon syarat, bentuk sama dengan undian_prizes.conditions supaya komponen
  -- rule builder yang sama melayani keduanya.
  --
  -- Peserta yang MEMENUHI pohon ini DIKECUALIKAN. Perhatikan arahnya: di
  -- undian_prizes.conditions memenuhi berarti BOLEH ikut. Karena itu aturan
  -- pengecualian sengaja disimpan di tabel terpisah, bukan sebagai node bertanda
  -- "negasi" di dalam syarat hadiah — dua arti berlawanan pada satu bentuk data
  -- adalah sumber kekeliruan yang tidak terlihat sampai kolamnya sudah salah.
  conditions jsonb not null default '{"op":"and","children":[]}'::jsonb,

  -- Cakupan: null = berlaku untuk SEMUA hadiah. Berisi id = hanya hadiah itu.
  --
  -- Perlu karena tidak semua pengecualian bersifat menyeluruh: "karyawan sponsor
  -- tidak boleh menang hadiah dari sponsornya sendiri" hanya berlaku pada satu
  -- hadiah, sementara mereka tetap berhak atas hadiah lain.
  prize_id int references public.undian_prizes(id) on delete cascade,

  -- Dimatikan, bukan dihapus. Aturan sering dinonaktifkan sementara untuk satu
  -- sesi lalu dipakai lagi, dan menghapusnya berarti menyusunnya dari awal
  -- justru saat waktu paling sempit.
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),

  constraint undian_exclusion_rules_conditions_shape check (
    jsonb_typeof(conditions) = 'object'
    and conditions ? 'op'
    and jsonb_typeof(conditions->'children') = 'array'
  ),
  -- Aturan dengan syarat kosong akan mengecualikan SEMUA ORANG: pohon kosong
  -- selalu bernilai benar, dan di sini benar berarti tersingkir. Kolamnya menjadi
  -- nol dan penyebabnya tidak terlihat di layar mana pun. Ditolak sejak awal.
  constraint undian_exclusion_rules_not_empty check (
    jsonb_array_length(conditions->'children') > 0
  )
);

create index if not exists undian_exclusion_rules_active_idx
  on public.undian_exclusion_rules (id) where is_active;

-- ---------------------------------------------------------------------------
-- Kolam peserta: berhenti menyaring, mulai MENANDAI.
--
-- Versi sebelumnya membuang peserta yang dikecualikan di dalam SQL. Akibatnya
-- halaman CMS tidak bisa menjelaskan apa pun: ia hanya tahu ada 245 nama dan
-- tidak punya cara menyebut tiga yang hilang, apalagi menyebut alasannya.
--
-- Sekarang seluruh peserta aktif dikembalikan beserta penanda, dan penyaringannya
-- dikerjakan src/lib/undian-pool.ts. Dengan begitu satu tempat yang sama dapat
-- melaporkan "248 peserta, 12 kena aturan, 3 dikecualikan manual, 4 sudah pernah
-- menang, 229 siap diundi" — angka yang bisa diperiksa panitia sebelum acara,
-- bukan satu angka akhir yang harus dipercaya begitu saja.
--
-- Return type berubah, jadi fungsinya di-drop lebih dulu: `create or replace`
-- tidak dapat mengubah kolom keluaran.
-- ---------------------------------------------------------------------------
drop function if exists public.undian_participant_pool();

create or replace function public.undian_participant_pool()
returns table (
  participant_id uuid,
  name text,
  company text,
  title text,
  qr_code text,
  participant_type text,
  rsvp_status text,
  checked_in boolean,
  scan_count int,
  seat_label text,
  allow_name_display boolean,
  total_spend bigint,
  booth_count int,
  already_won int,
  -- Ada di daftar pengecualian per orang. Ditandai, tidak lagi dibuang.
  manually_excluded boolean,
  -- Alasan yang ditulis panitia, supaya layar CMS dapat menyebutnya.
  exclusion_reason text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with spend as (
    select
      o.participant_id,
      coalesce(sum(o.regular_amount), 0)::bigint
        + coalesce(sum((
            select coalesce(sum(i.price_at_claim), 0)
            from public.order_special_items i
            where i.order_id = o.id and i.counts_toward_leaderboard
          )), 0)::bigint as total_spend,
      count(distinct o.booth_id)::int as booth_count
    from public.orders o
    where o.status in ('paid', 'handed_over')
    group by o.participant_id
  ),
  wins as (
    -- Kemenangan yang ditolak tidak dihitung: peserta yang namanya keluar lalu
    -- ternyata tidak hadir harus kembali ke kolam, bukan gugur selamanya.
    select w.participant_id, count(*)::int as already_won
    from public.undian_winners w
    where w.participant_id is not null and w.status <> 'rejected'
    group by w.participant_id
  )
  select
    p.id,
    p.name,
    p.company,
    p.title,
    p.qr_code,
    p.participant_type,
    p.rsvp_status,
    p.source_checked_in,
    p.source_total_scans,
    -- Kursi pertama saja. Layar panggung hanya perlu satu penunjuk lokasi agar
    -- pemenang dapat ditemukan petugas, bukan daftar lengkap sub-acara.
    nullif(trim(coalesce(p.seats->0->>'label', '')), ''),
    p.allow_name_display,
    coalesce(s.total_spend, 0),
    coalesce(s.booth_count, 0),
    coalesce(w.already_won, 0),
    x.participant_id is not null,
    x.reason
  from public.participants p
  left join spend s on s.participant_id = p.id
  left join wins  w on w.participant_id = p.id
  left join public.undian_exclusions x on x.participant_id = p.id
  -- Peserta yang hilang dari sumber tetap SATU-SATUNYA yang disaring di sini.
  -- Ia sudah tidak terdaftar, dan namanya yang keluar di panggung adalah nama yang
  -- tidak akan menjawab. Tidak ada yang perlu menghitung atau menjelaskannya.
  where p.source_removed_at is null
  order by p.name;
$function$;

alter table public.undian_exclusion_rules enable row level security;
revoke all on table public.undian_exclusion_rules from anon, authenticated;
revoke all on sequence public.undian_exclusion_rules_id_seq from anon, authenticated;

revoke all on function public.undian_participant_pool() from public, anon, authenticated;
grant execute on function public.undian_participant_pool() to service_role;

comment on table public.undian_exclusion_rules is
  'Aturan pengecualian undian. Peserta yang MEMENUHI conditions justru DIKECUALIKAN — arahnya berlawanan dengan undian_prizes.conditions, karena itu tabelnya dipisah.';
comment on column public.undian_exclusion_rules.prize_id is
  'null = berlaku untuk semua hadiah. Berisi id = hanya hadiah itu, mis. karyawan sponsor pada hadiah sponsornya sendiri.';
comment on function public.undian_participant_pool() is
  'Seluruh peserta aktif beserta agregat dan penanda pengecualian. Menandai, tidak menyaring: penyaringan ada di src/lib/undian-pool.ts supaya CMS dapat menjelaskan rincian kolam.';
