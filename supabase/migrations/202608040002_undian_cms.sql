-- ---------------------------------------------------------------------------
-- CMS Undian: hadiah, syarat peserta, kontrol operator, dan layar panggung.
--
-- Bentuk tabelnya mengikuti pemisahan yang sudah terbukti di leaderboard_reveal:
--
--   undian_settings   KONFIGURASI tampilan panggung (branding, suara, privasi).
--   undian_prizes     KONFIGURASI hadiah dan syarat siapa yang boleh diundi.
--   undian_state      STATE saat acara berjalan (sedang mengundi hadiah apa).
--   undian_winners    HASIL, permanen.
--
-- Konfigurasi dan state TIDAK boleh satu tabel. Kalau digabung:
--   * setiap klik "Undi" menaikkan updated_at, sehingga label "terakhir diubah"
--     di CMS berbohong;
--   * nilai state ikut terbawa di payload tombol "Simpan", jadi operator yang
--     sedang mengundi bisa tanpa sengaja mempublikasikan editan warna yang belum
--     selesai.
--
-- Aturan kerahasiaan pemenang ada di kolom `pending` pada undian_state. Lihat
-- komentarnya; itu inti dari seluruh fitur ini.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. Setelan panggung (singleton)
-- ===========================================================================
create table if not exists public.undian_settings (
  id int primary key default 1 check (id = 1),

  page_title text not null default 'Undian Berhadiah',
  page_subtitle text,

  -- Privasi nama pemenang.
  --
  -- 'full'         = selalu nama lengkap.
  -- 'follow_event' = ikut event_settings.name_display_mode dan
  --                  participants.allow_name_display, sama seperti leaderboard.
  --
  -- Bawaannya 'full' dan itu keputusan sadar: undian berakhir dengan pemanggilan
  -- nama ke atas panggung. Nama yang disamarkan menjadi "A. S." membuat momen itu
  -- mustahil dijalankan, dan panitia akan mencari nama aslinya di layar admin
  -- sambil MC menunggu. Yang memilih menyamarkan harus melakukannya secara sadar.
  name_display text not null default 'full' check (name_display in ('full', 'follow_event')),
  show_company boolean not null default true,
  show_seat boolean not null default true,

  -- Suara dan confetti dimatikan dari satu tempat karena keduanya sering harus
  -- dimatikan mendadak: sound system venue sudah memutar musik sendiri, atau
  -- confetti membuat kamera live streaming kesulitan.
  sound_enabled boolean not null default true,
  confetti_enabled boolean not null default true,

  -- Jeda sebelum nama pemenang benar-benar terbaca, di luar durasi animasi.
  -- Memberi MC waktu menarik napas sebelum menyebut nama.
  reveal_delay_seconds numeric(4, 1) not null default 0.0,

  background_color text,
  text_color text,
  accent_color text,
  background_image_url text,

  -- Kolom branding bersama. Nama sengaja IDENTIK dengan display_settings,
  -- rundown_settings, dan seat_map_sessions supaya BRANDING_COLUMNS,
  -- normalizeBranding(), dan <BrandingEditor> yang sudah ada langsung melayani
  -- tabel ini tanpa satu baris kode baru.
  logo_url text,
  logo_scale numeric(4, 2) not null default 1.00,
  footer_image_url text,
  footer_image_scale numeric(4, 2) not null default 1.00,
  footer_text text,
  heading_font branding_font not null default 'sans',
  title_scale numeric(4, 2) not null default 1.00,
  subtitle_scale numeric(4, 2) not null default 1.00,
  footer_scale numeric(4, 2) not null default 1.00,
  title_color text,
  subtitle_color text,
  footer_text_color text,

  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id),

  constraint undian_settings_background_color_hex check (background_color is null or background_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint undian_settings_text_color_hex check (text_color is null or text_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint undian_settings_accent_color_hex check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint undian_settings_title_color_hex check (title_color is null or title_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint undian_settings_subtitle_color_hex check (subtitle_color is null or subtitle_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint undian_settings_footer_text_color_hex check (footer_text_color is null or footer_text_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint undian_settings_logo_scale_range check (logo_scale between 0.5 and 2),
  constraint undian_settings_footer_image_scale_range check (footer_image_scale between 0.5 and 2),
  constraint undian_settings_title_scale_range check (title_scale between 0.5 and 2),
  constraint undian_settings_subtitle_scale_range check (subtitle_scale between 0.5 and 2),
  constraint undian_settings_footer_scale_range check (footer_scale between 0.5 and 2),
  constraint undian_settings_reveal_delay_range check (reveal_delay_seconds between 0 and 10)
);

insert into public.undian_settings (id) values (1) on conflict (id) do nothing;


-- ===========================================================================
-- 2. Daftar entri manual / hasil import
-- ===========================================================================
-- Sumber data kedua, di samping tabel peserta. Dipakai ketika yang diundi bukan
-- peserta terdaftar: kupon fisik yang dikumpulkan di meja registrasi, daftar
-- karyawan dari sponsor, atau nomor kursi polos.
--
-- Dikelompokkan karena satu acara lazim punya beberapa daftar berbeda yang hidup
-- bersamaan ("Kupon Sesi Siang", "Daftar Sponsor A"), dan setiap hadiah menunjuk
-- satu di antaranya. Tanpa grup, mengundi hadiah kedua akan menuntut daftar
-- pertama dihapus lebih dulu.
create table if not exists public.undian_entry_groups (
  id serial primary key,
  name text not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

create table if not exists public.undian_entries (
  id bigserial primary key,
  group_id int not null references public.undian_entry_groups(id) on delete cascade,

  label text not null,      -- nama yang tampil besar di layar
  sublabel text,            -- perusahaan / jabatan / keterangan
  code text,                -- nomor kupon, nomor kursi, atau QR

  -- Bobot per baris. 1 = satu tiket. Import CSV boleh membawa kolom bobot supaya
  -- kupon fisik yang dikumpulkan berlipat tidak perlu ditulis berulang kali.
  weight int not null default 1 check (weight between 1 and 1000),

  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists undian_entries_group_idx on public.undian_entries (group_id) where is_active;


-- ===========================================================================
-- 3. Peserta yang dikecualikan secara manual
-- ===========================================================================
-- Panitia, MC, direksi, dan perwakilan sponsor lazimnya tidak boleh menang
-- meskipun terdaftar sebagai peserta dan memenuhi semua syarat.
--
-- Dibuat tabel tersendiri, bukan kolom boolean di `participants`, karena
-- `participants` disinkronkan ulang dari Scanner API secara berkala: kolom apa
-- pun di sana berisiko tertimpa, dan daftar pengecualian yang hilang di tengah
-- acara tidak akan disadari sampai nama panitia keluar sebagai pemenang.
create table if not exists public.undian_exclusions (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);


-- ===========================================================================
-- 4. Hadiah
-- ===========================================================================
create table if not exists public.undian_prizes (
  id serial primary key,

  name text not null,
  description text,
  image_url text,
  sponsor_name text,

  -- Jumlah pemenang yang keluar dalam SATU kali tekan tombol undi.
  winners_per_draw int not null default 1 check (winners_per_draw between 1 and 50),
  -- Total kuota pemenang hadiah ini. Boleh lebih besar dari winners_per_draw,
  -- artinya hadiah diundi beberapa kali (mis. 10 voucher, 2 orang per undi).
  winner_quota int not null default 1 check (winner_quota between 1 and 500),
  -- Cadangan yang ikut diundi tapi ditandai terpisah, dipakai bila pemenang
  -- utama tidak ada di tempat. Diundi bersamaan supaya tetap dari kolam yang
  -- sama dan tidak perlu mengundi ulang di atas panggung.
  backup_per_draw int not null default 0 check (backup_per_draw between 0 and 20),

  -- Lapisan animasi di layar panggung. Semuanya memakai mesin pemilihan yang
  -- sama di server; yang berbeda hanya cara nama itu ditampilkan.
  animation text not null default 'wheel'
    check (animation in ('wheel', 'slot', 'cards', 'digits', 'instant')),
  spin_seconds numeric(4, 1) not null default 6.0 check (spin_seconds between 1 and 60),

  -- 'participants' = ikut tab Peserta, disaring `conditions`.
  -- 'entries'      = daftar manual / hasil import pada entry_group_id.
  source text not null default 'participants' check (source in ('participants', 'entries')),
  entry_group_id int references public.undian_entry_groups(id) on delete set null,

  -- Pohon syarat AND/OR, bentuknya sama persis dengan special_offers.conditions
  -- supaya komponen <ConditionBuilder> yang sudah ada bisa dipakai ulang.
  -- children kosong = semua peserta aktif memenuhi syarat.
  conditions jsonb not null default '{"op":"and","children":[]}'::jsonb,

  -- Cakupan larangan menang berulang.
  -- 'none'       = boleh menang lagi di hadiah mana pun.
  -- 'this_prize' = tidak boleh menang dua kali pada hadiah yang sama.
  -- 'all_prizes' = sekali menang, gugur dari semua undian berikutnya.
  exclude_scope text not null default 'all_prizes'
    check (exclude_scope in ('none', 'this_prize', 'all_prizes')),

  -- Bobot peluang menang.
  -- 'equal'   = semua yang lolos syarat berpeluang sama.
  -- 'formula' = tiket = base + floor(nilai_variabel / divisor), dijepit ke max.
  --
  -- Dijepit oleh weight_max dengan sengaja: tanpa batas atas, satu peserta dengan
  -- belanja jauh di atas rata-rata dapat menguasai sebagian besar tiket, dan
  -- undian berhenti terasa seperti undian bagi semua orang lain di ruangan.
  weight_mode text not null default 'equal' check (weight_mode in ('equal', 'formula')),
  weight_var text not null default 'total_spend'
    check (weight_var in ('total_spend', 'booth_count', 'scan_count')),
  weight_divisor numeric(14, 2) not null default 500000 check (weight_divisor > 0),
  weight_base int not null default 1 check (weight_base between 0 and 100),
  weight_max int not null default 10 check (weight_max between 1 and 1000),

  sort_order int not null default 0,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id),

  constraint undian_prizes_conditions_shape check (
    jsonb_typeof(conditions) = 'object'
    and conditions ? 'op'
    and jsonb_typeof(conditions->'children') = 'array'
  ),
  constraint undian_prizes_weight_range check (weight_base <= weight_max),
  -- Sumber 'entries' tanpa daftar yang ditunjuk akan menghasilkan kolam kosong
  -- dan tombol undi yang gagal tanpa penjelasan. Ditolak sejak awal.
  constraint undian_prizes_entry_group_required check (source <> 'entries' or entry_group_id is not null)
);

create index if not exists undian_prizes_active_idx on public.undian_prizes (sort_order, id) where is_active;


-- ===========================================================================
-- 5. State runtime
-- ===========================================================================
create table if not exists public.undian_state (
  id int primary key default 1 check (id = 1),

  -- 'off' mempertahankan halaman /undian dalam keadaan diam. Selalu sediakan
  -- saklar mati untuk fitur yang dipakai di atas panggung; itu satu-satunya
  -- jalan keluar ketika ada yang salah di tengah acara.
  mode text not null default 'off' check (mode in ('off', 'live')),

  active_prize_id int references public.undian_prizes(id) on delete set null,

  -- 'idle'     = layar menunggu, menampilkan hadiah.
  -- 'spinning' = animasi berjalan, pemenang SUDAH ditentukan tapi dirahasiakan.
  -- 'revealed' = pemenang boleh ditampilkan.
  phase text not null default 'idle' check (phase in ('idle', 'spinning', 'revealed')),

  -- Naik satu setiap kali tombol undi ditekan. Layar memakainya untuk mengenali
  -- "ini undian baru" dan mengulang animasi dari awal. Tanpa penanda ini, dua
  -- undian berturut-turut pada hadiah yang sama tidak dapat dibedakan oleh klien
  -- yang hanya melihat perubahan data.
  draw_round int not null default 0,

  spin_started_at timestamptz,
  -- Waktu paling awal pemenang boleh dikirim ke klien. Server membandingkannya
  -- dengan now() pada setiap GET.
  reveal_at timestamptz,

  -- ------------------------------------------------------------------------
  -- PEMENANG YANG BELUM DIUMUMKAN.
  --
  -- Kolom ini TIDAK PERNAH ikut dalam response GET publik selama
  -- now() < reveal_at. Pemilihan terjadi di server pada saat tombol ditekan,
  -- lalu hasilnya menunggu di sini.
  --
  -- Alasannya sama dengan /api/display/reveal: bila nama pemenang dikirim lebih
  -- awal dan hanya disembunyikan oleh animasi di browser, siapa pun yang membuka
  -- /undian di laptopnya sendiri melihat pemenang di tab Network sebelum MC
  -- menyebutnya. Animasi adalah teater; keputusannya sudah selesai di server.
  -- ------------------------------------------------------------------------
  pending jsonb,

  -- Kolam peserta yang dibekukan saat undi dimulai.
  --
  -- Dibekukan karena kolamnya hidup: peserta masih check-in dan masih bertransaksi
  -- selama acara. Tanpa pembekuan, daftar nama yang berputar di roda berubah di
  -- tengah putaran, dan pertanyaan "tadi nama saya ada di roda tidak?" tidak punya
  -- jawaban yang bisa dipertanggungjawabkan.
  pool jsonb,
  pool_frozen_at timestamptz,
  pool_size int not null default 0,

  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

insert into public.undian_state (id) values (1) on conflict (id) do nothing;


-- ===========================================================================
-- 6. Pemenang
-- ===========================================================================
create table if not exists public.undian_winners (
  id bigserial primary key,
  prize_id int not null references public.undian_prizes(id) on delete cascade,
  draw_round int not null,

  -- Salah satu dari keduanya terisi, sesuai `source` hadiah.
  participant_id uuid references public.participants(id) on delete set null,
  entry_id bigint references public.undian_entries(id) on delete set null,

  -- Nama disalin, bukan hanya direferensikan.
  --
  -- `participants` disinkronkan ulang dari Scanner API dan barisnya bisa ditandai
  -- terhapus setelah acara. Daftar pemenang adalah catatan permanen serah terima
  -- hadiah; ia tidak boleh berubah isinya karena sistem lain berubah.
  display_name text not null,
  company text,
  seat_label text,

  -- Cadangan diundi bersama pemenang utama, ditandai di sini.
  is_backup boolean not null default false,
  slot_order int not null default 1,

  -- 'pending'   = baru keluar, belum dikonfirmasi hadir.
  -- 'confirmed' = naik panggung, hadiah diserahkan.
  -- 'rejected'  = tidak hadir / tidak berhak, kembali diundi.
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  reject_reason text,

  drawn_at timestamptz not null default now(),
  drawn_by uuid references public.users(id),
  decided_at timestamptz,
  decided_by uuid references public.users(id)
);

create index if not exists undian_winners_prize_idx on public.undian_winners (prize_id, draw_round, slot_order);
create index if not exists undian_winners_participant_idx on public.undian_winners (participant_id) where participant_id is not null;


-- ===========================================================================
-- 7. Kolam peserta
-- ===========================================================================
-- Satu query mengembalikan seluruh peserta aktif LENGKAP dengan agregat yang
-- dipakai sebagai syarat maupun bobot.
--
-- Sengaja tidak memakai evaluator syarat di dalam Postgres seperti
-- evaluate_offer_conditions. Penyaringan dikerjakan di TypeScript oleh
-- src/lib/undian.ts, dan itu keputusan sadar dengan dua keuntungan:
--
--   1. Halaman CMS dapat menghitung "berapa peserta yang memenuhi syarat"
--      seketika sambil syarat diedit, memakai evaluator yang PERSIS SAMA dengan
--      yang menentukan pemenang. Kalau penyaringan ada di dalam SQL, angka di
--      layar CMS adalah tiruan yang bisa menyimpang tanpa ketahuan.
--   2. Tidak ada N+1: agregat dihitung sekali untuk semua peserta di sini,
--      bukan satu pemanggilan fungsi per peserta.
--
-- Definisi order paid/handed_over dibuat identik dengan get_leaderboard dan
-- participant_spend supaya syarat undian dan angka top spender tidak pernah
-- berbeda untuk orang yang sama.
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
  already_won int
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
    coalesce(w.already_won, 0)
  from public.participants p
  left join spend s on s.participant_id = p.id
  left join wins  w on w.participant_id = p.id
  -- Peserta yang hilang dari sumber tidak pernah ikut diundi. Ia sudah tidak
  -- terdaftar, dan namanya yang keluar di panggung adalah nama yang tidak akan
  -- menjawab.
  where p.source_removed_at is null
    and not exists (select 1 from public.undian_exclusions x where x.participant_id = p.id)
  order by p.name;
$function$;


-- ===========================================================================
-- 8. Keamanan
-- ===========================================================================
-- Pola seluruh repo: RLS menyala tanpa satu pun policy, semua akses lewat route
-- handler yang memakai service role.
alter table public.undian_settings     enable row level security;
alter table public.undian_entry_groups enable row level security;
alter table public.undian_entries      enable row level security;
alter table public.undian_exclusions   enable row level security;
alter table public.undian_prizes       enable row level security;
alter table public.undian_state        enable row level security;
alter table public.undian_winners      enable row level security;

revoke all on table public.undian_settings     from anon, authenticated;
revoke all on table public.undian_entry_groups from anon, authenticated;
revoke all on table public.undian_entries      from anon, authenticated;
revoke all on table public.undian_exclusions   from anon, authenticated;
revoke all on table public.undian_prizes       from anon, authenticated;
revoke all on table public.undian_state        from anon, authenticated;
revoke all on table public.undian_winners      from anon, authenticated;

-- Sequence ikut dicabut. Tabel yang terkunci tapi sequence-nya terbuka masih
-- membocorkan laju pertumbuhan data.
revoke all on sequence public.undian_entry_groups_id_seq from anon, authenticated;
revoke all on sequence public.undian_entries_id_seq      from anon, authenticated;
revoke all on sequence public.undian_prizes_id_seq       from anon, authenticated;
revoke all on sequence public.undian_winners_id_seq      from anon, authenticated;

revoke all on function public.undian_participant_pool() from public, anon, authenticated;
grant execute on function public.undian_participant_pool() to service_role;


-- ===========================================================================
-- 9. Dokumentasi kolom yang mudah disalahpahami
-- ===========================================================================
comment on table public.undian_state is
  'State runtime undian. Terpisah dari undian_settings supaya klik "Undi" tidak menyentuh updated_at konfigurasi dan tidak ikut terkirim di payload tombol Simpan.';
comment on column public.undian_state.pending is
  'Pemenang yang sudah ditentukan server tapi belum boleh diumumkan. TIDAK PERNAH ikut response GET publik selama now() < reveal_at.';
comment on column public.undian_state.pool is
  'Kolam peserta yang dibekukan saat undi dimulai, supaya daftar nama yang berputar tidak berubah di tengah putaran.';
comment on column public.undian_prizes.winners_per_draw is
  'Berapa pemenang keluar dalam satu kali tekan tombol. Berbeda dari winner_quota, yaitu total pemenang hadiah ini lintas beberapa kali undi.';
comment on column public.undian_prizes.weight_max is
  'Batas atas tiket per peserta. Tanpa batas, satu peserta dengan belanja ekstrem menguasai kolam dan undian berhenti terasa seperti undian.';
comment on column public.undian_winners.display_name is
  'Nama disalin saat menang, bukan direferensikan. participants disinkronkan ulang dari Scanner API; catatan pemenang harus tetap utuh.';
comment on table public.undian_exclusions is
  'Peserta yang tidak boleh menang (panitia, MC, sponsor). Tabel terpisah karena kolom di participants berisiko tertimpa sinkronisasi Scanner API.';
