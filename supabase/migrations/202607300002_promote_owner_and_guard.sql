-- Tahap 2 dari 2: naikkan pemilik sistem ke super_admin + pengaman di database.
--
-- Dijalankan sebagai migrasi terpisah karena nilai enum 'super_admin' baru dapat
-- dipakai setelah migrasi 202607300001 commit (lihat catatan di file tersebut).
--
-- Pembagian kewenangan:
--   admin (klien)     : dashboard, laporan, export, booth & item spesial, metode
--                       pembayaran, settings, Live Display, sync peserta,
--                       void order handed_over (BR-08), reset PIN operator
--                       booth/kasir, dan LIHAT daftar user (read-only).
--   super_admin (kita): semua di atas, plus reset data (danger zone) dan
--                       kelola user/role sepenuhnya.
--
-- Void handed_over tetap di `admin` karena itu kebutuhan operasional nyata di
-- hari-H, sudah wajib beralasan, dan tercatat di audit log.

-- Naikkan satu-satunya admin yang ada saat ini menjadi pemilik sistem.
-- Dibatasi pada username spesifik agar admin yang dibuat kemudian TIDAK ikut naik.
update public.users
set role = 'super_admin'
where username = 'admin.prima' and role = 'admin';

-- Pengaman: minimal satu super_admin aktif harus tersisa.
--
-- Guard lama di API hanya menjaga "minimal satu admin aktif". Setelah pemisahan
-- role, guard itu tidak lagi cukup: tanpa pengaman ini, super_admin terakhir dapat
-- dinonaktifkan atau diturunkan menjadi admin, dan tidak ada jalan pulih dari
-- dalam aplikasi karena reset data dan kelola user hanya bisa diakses super_admin.
--
-- Ditegakkan di database, bukan hanya di API, karena kerusakannya membutuhkan
-- akses SQL langsung untuk diperbaiki.
create or replace function public.guard_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if (select count(*) from public.users where role = 'super_admin' and is_active) = 0 then
    raise exception using errcode = '23514',
      message = 'LAST_SUPER_ADMIN_REQUIRED: minimal satu super admin aktif harus tersisa';
  end if;
  return null;
end;
$function$;

drop trigger if exists users_guard_last_super_admin on public.users;
create constraint trigger users_guard_last_super_admin
  after update or delete on public.users
  deferrable initially deferred
  for each row execute function public.guard_last_super_admin();

revoke all on function public.guard_last_super_admin() from public, anon, authenticated;
grant execute on function public.guard_last_super_admin() to service_role;
