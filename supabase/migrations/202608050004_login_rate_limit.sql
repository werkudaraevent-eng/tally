-- Rate limit percobaan login, ditegakkan sebelum bcrypt dijalankan.
--
-- Masalah yang diperbaiki. Diukur pada mesin pengembangan:
--   bcrypt compare cost 12    = 526ms sendirian, 1807ms di bawah beban paralel
--   bcrypt compare cost 10    = 312ms di bawah beban paralel (5,8x lebih murah)
--   submit order normal       = 954ms
--   submit order saat 20 login salah berjalan = 14.583ms  (15x lebih lambat)
--   30 percobaan PIN salah    = 48.647ms, SELURUHNYA dilayani, tidak ada penolakan
--   jeda event loop terburuk saat 10 compare cost 12 = 991ms
--
-- `bcryptjs` adalah implementasi JavaScript murni, jadi setiap pembandingan
-- menahan event loop Node sepenuhnya. Route handler order booth mengantre di
-- belakangnya. Akibat yang terlihat di meja booth: tombol "Buat order" tampak
-- menggantung belasan detik, staf menekannya dua kali, tekanan kedua ditolak
-- ORDER_CODE_USED, dan staf menyimpulkan aplikasinya rusak.
--
-- Karena itu penolakan WAJIB terjadi sebelum bcrypt dipanggil. Rate limit yang
-- memanggil bcrypt lebih dulu lalu menolak hasilnya tidak menyelesaikan apa pun:
-- biaya yang mengganggu sudah dikeluarkan.
--
-- Kenapa di database, bukan Map di memori proses. Aplikasi berjalan di Vercel
-- dengan banyak instance fungsi, dan tiap instance punya memorinya sendiri. Peta
-- di memori berarti batasnya terkalikan sebanyak instance yang aktif, dan hilang
-- setiap kali instance didaur. Satu perjalanan ke database (~30ms) jauh lebih
-- murah daripada satu bcrypt (~526ms) yang hendak dicegah.
--
-- Kenapa dikunci per USERNAME, bukan per alamat IP. Wi-Fi venue menempatkan
-- seluruh perangkat panitia di belakang satu NAT, jadi satu IP publik dipakai
-- kesembilan booth sekaligus. Pembatasan berbasis IP akan mengunci seluruh tim
-- booth karena satu orang salah mengetik PIN di HP-nya. Username adalah satuan
-- yang benar di sini.
--
-- Konsekuensi yang diterima: seseorang dapat sengaja mengunci username orang lain
-- dengan mengirim PIN salah. Karena itu kuncian dibuat SINGKAT dan selalu berakhir
-- sendiri. Kuncian panjang atau permanen tidak dapat diterima pada sistem yang
-- dipakai di atas panggung: pukul 21.00 kuncian permanen berarti booth berhenti
-- bekerja dan tidak ada yang bisa membukanya.

create table if not exists public.login_attempts (
  -- Username dinormalisasi huruf kecil. Tanpa ini "Admin.Booth1" dan
  -- "admin.booth1" menjadi dua baris berbeda dan batasnya berlipat dua.
  username        text primary key,
  fail_count      int not null default 0,
  -- Awal jendela hitung. Ketika jendela lewat, hitungan mulai dari nol lagi:
  -- salah ketik pagi hari tidak boleh diperhitungkan lagi pada malam acara.
  window_start    timestamptz not null default now(),
  locked_until    timestamptz,
  -- Jumlah kuncian dalam jendela ini. Dipakai menaikkan durasi secara bertahap,
  -- sehingga percobaan beruntun makin mahal tanpa pernah menjadi permanen.
  lock_count      int not null default 0,
  last_attempt_at timestamptz not null default now()
);

alter table public.login_attempts enable row level security;
revoke all on table public.login_attempts from public, anon, authenticated;

comment on table public.login_attempts is
  'Penghitung percobaan login per username. Diperiksa sebelum bcrypt dijalankan.';

-- Baris yang tidak tersentuh lama tidak perlu disimpan. Indeks ini melayani
-- pembersihan berkala di bawah.
create index if not exists login_attempts_last_attempt_idx
  on public.login_attempts (last_attempt_at);

-- ---------------------------------------------------------------------------
-- Pemeriksaan sebelum bcrypt
-- ---------------------------------------------------------------------------
-- Mengembalikan { allowed, retry_after_seconds, fail_count }.
--
-- Hitungan dinaikkan DI SINI, sebelum PIN diperiksa, bukan setelah kegagalan
-- diketahui. Ini bukan pilihan gaya — versi pertama fungsi ini hanya MEMBACA
-- penghitung dan menaikkannya belakangan, dan pengukuran menunjukkan rancangan itu
-- tidak menahan apa pun: 20 permintaan login yang datang BERSAMAAN semuanya membaca
-- penghitung sebelum salah satu pun menaikkannya, sehingga kedua puluhnya lolos ke
-- bcrypt. Batas hanya bekerja untuk percobaan berurutan, sedangkan serangan
-- otomatis justru selalu paralel. Satu submit order terukur 27,6 detik pada uji itu.
--
-- Dengan `insert .. on conflict do update`, setiap pemanggilan menaikkan penghitung
-- secara atomik di dalam satu pernyataan, jadi urutan kedatangan tidak lagi
-- menentukan hasilnya.
--
-- Akibat yang disengaja: login BERHASIL pun ikut terhitung. Itu aman karena
-- `clear_login_attempts` MENGHAPUS barisnya, jadi operator yang bekerja normal
-- tidak pernah menumpuk hitungan.
create or replace function public.begin_login_attempt(p_username text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  row_data public.login_attempts;
  key text := lower(trim(p_username));
  -- Ambang 6 percobaan per 10 menit. Angkanya diturunkan dari 10 setelah diukur,
  -- bukan dipilih dari perasaan.
  --
  -- Yang menentukan bukan seberapa "aman" ambangnya, melainkan berapa banyak
  -- bcrypt yang boleh lolos sebelum gerbang menutup, karena tiap satu bcrypt
  -- menahan event loop Node dan menahan pembuatan order booth bersamanya.
  -- Terukur di mesin pengembangan, di bawah beban paralel:
  --   cost 12 = 1807ms per compare  -> 10 x 1807ms = 13,4 detik tertahan
  --   cost 10 =  312ms per compare  ->  6 x  312ms =  1,9 detik tertahan
  -- Menurunkan cost saja tidak cukup, menurunkan ambang saja tidak cukup; kedua
  -- tuas dipakai bersama.
  --
  -- Enam masih longgar untuk manusia: staf booth mengetik PIN 6 digit di layar HP
  -- sambil melayani peserta, dan enam kali salah ketik berturut-turut sudah bukan
  -- salah ketik lagi. Kuncian pertamanya pun hanya 60 detik.
  threshold int := 6;
  window_minutes int := 10;
  lock_seconds int;
begin
  -- Kuncian yang masih berjalan ditolak lebih dulu, dan TIDAK menaikkan hitungan.
  -- Kalau ikut naik, permintaan yang datang selama kuncian akan memperpanjang
  -- kuncian itu sendiri dan pengunciannya menjadi tak berujung.
  select * into row_data from public.login_attempts where username = key;
  if row_data.locked_until is not null and row_data.locked_until > now() then
    return jsonb_build_object(
      'allowed', false,
      -- Dibulatkan ke ATAS: memberitahu "tunggu 0 detik" saat masih terkunci
      -- membuat staf menekan tombol lagi dan langsung ditolak lagi.
      'retry_after_seconds', ceil(extract(epoch from (row_data.locked_until - now())))::int
    );
  end if;

  insert into public.login_attempts (username, fail_count, window_start, last_attempt_at)
  values (key, 1, now(), now())
  on conflict (username) do update set
    -- Jendela kedaluwarsa: hitungan dan riwayat kuncian dimulai dari awal, supaya
    -- salah ketik pagi hari tidak diperhitungkan lagi pada malam acara.
    fail_count = case
      when public.login_attempts.window_start < now() - make_interval(mins => window_minutes) then 1
      else public.login_attempts.fail_count + 1 end,
    window_start = case
      when public.login_attempts.window_start < now() - make_interval(mins => window_minutes) then now()
      else public.login_attempts.window_start end,
    lock_count = case
      when public.login_attempts.window_start < now() - make_interval(mins => window_minutes) then 0
      else public.login_attempts.lock_count end,
    last_attempt_at = now()
  returning * into row_data;

  if row_data.fail_count > threshold then
    -- Bertahap 60s, 120s, 240s, dibatasi 300s. Batas atas ada dengan sengaja:
    -- kuncian yang tumbuh tanpa batas akhirnya sama saja dengan permanen, dan
    -- tidak ada satu pun keadaan di acara ini yang membenarkannya. Pukul 21.00,
    -- kuncian permanen berarti booth berhenti bekerja tanpa jalan keluar.
    lock_seconds := least(60 * power(2, row_data.lock_count)::int, 300);
    update public.login_attempts
    set locked_until = now() + make_interval(secs => lock_seconds),
        lock_count = lock_count + 1,
        -- Direset agar kuncian berikutnya menuntut 10 kegagalan BARU, bukan
        -- langsung terpicu oleh percobaan pertama setelah kuncian berakhir.
        fail_count = 0
    where username = key;

    return jsonb_build_object('allowed', false, 'retry_after_seconds', lock_seconds);
  end if;

  return jsonb_build_object(
    'allowed', true,
    'retry_after_seconds', 0,
    'attempts_used', row_data.fail_count,
    'remaining_attempts', threshold - row_data.fail_count
  );
end;
$function$;

revoke all on function public.begin_login_attempt(text) from public, anon, authenticated;
grant execute on function public.begin_login_attempt(text) to service_role;

-- ---------------------------------------------------------------------------
-- Bersihkan setelah login berhasil
-- ---------------------------------------------------------------------------
-- Barisnya DIHAPUS, bukan di-nol-kan. Operator yang berhasil masuk tidak boleh
-- membawa riwayat apa pun ke percobaan berikutnya, termasuk `lock_count` yang akan
-- membuat kuncian berikutnya lebih panjang tanpa alasan.
create or replace function public.clear_login_attempts(p_username text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  delete from public.login_attempts where username = lower(trim(p_username));
$function$;

revoke all on function public.clear_login_attempts(text) from public, anon, authenticated;
grant execute on function public.clear_login_attempts(text) to service_role;

-- Baris tua dibuang bersamaan dengan pekerjaan auto-void yang sudah berjalan tiap
-- 5 menit, bukan dengan jadwal cron baru. Satu jadwal lagi berarti satu lagi yang
-- harus diperiksa saat ada yang tidak berjalan di hari-H.
create or replace function public.purge_stale_login_attempts()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  removed int;
begin
  delete from public.login_attempts
  where last_attempt_at < now() - interval '1 day'
    and (locked_until is null or locked_until < now());
  get diagnostics removed = row_count;
  return removed;
end;
$function$;

revoke all on function public.purge_stale_login_attempts() from public, anon, authenticated;
grant execute on function public.purge_stale_login_attempts() to service_role;
