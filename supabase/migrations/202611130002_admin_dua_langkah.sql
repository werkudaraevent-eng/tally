-- Masuk admin dengan kata sandi + kode authenticator (Mas, 13 Nov).
--
-- Admin dan super admin: kata sandi (scrypt) + TOTP + 10 kode cadangan. Akun
-- perangkat (booth, kasir, scanner, viewer, custom) tetap PIN di pin_hash.
-- Admin yang belum punya kata sandi masuk sekali dengan PIN-nya, lalu wajib
-- memasang kata sandi dan authenticator sebelum mendapat sesi.
--
-- Semua kolom boleh null / berbawaan, jadi baris yang ada tidak berubah dan
-- kode lama tetap berjalan. Tabel users sudah RLS tanpa policy (service role).

begin;
set local lock_timeout = '5s';

alter table public.users
  add column if not exists password_hash   text,
  -- Rahasia TOTP, AES-256-GCM (src/lib/auth/kredensial.ts). Bukan teks asli.
  add column if not exists totp_secret     text,
  add column if not exists totp_enabled_at timestamptz,
  -- Langkah 30 detik terakhir yang dipakai: kode yang sama tidak bisa dipakai dua kali.
  add column if not exists totp_last_step  bigint,
  -- sha256 heksadesimal dari kode cadangan yang belum dipakai.
  add column if not exists recovery_codes  jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_recovery_codes_array') then
    alter table public.users add constraint users_recovery_codes_array check (jsonb_typeof(recovery_codes) = 'array' and jsonb_array_length(recovery_codes) <= 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_totp_pair') then
    -- Authenticator aktif selalu punya rahasia.
    alter table public.users add constraint users_totp_pair check (totp_enabled_at is null or totp_secret is not null);
  end if;
end $$;

comment on column public.users.password_hash is 'Kata sandi admin/super admin (scrypt). Null = belum dipasang; masuk dengan PIN lalu wajib setup.';
-- Pakai satu langkah TOTP / satu kode cadangan secara atomik. PATCH bersyarat
-- lewat PostgREST tidak bisa dipakai di sini: di bawah v14 hasil PATCH disaring
-- ulang dengan filter yang sama, sehingga baris yang baru berubah tidak kembali.
-- Dua permintaan paralel dengan kode yang sama: hanya satu yang mendapat true.
create or replace function public.staff_pakai_langkah_totp(p_user uuid, p_langkah bigint)
returns boolean
language sql
set search_path = public
as $$
  with u as (
    update public.users set totp_last_step = p_langkah
    where id = p_user and totp_enabled_at is not null
      and (totp_last_step is null or totp_last_step < p_langkah)
    returning 1
  )
  select exists (select 1 from u);
$$;

-- Sisa jumlah kode setelah satu dipakai, atau null bila hash tidak ada.
create or replace function public.staff_pakai_kode_cadangan(p_user uuid, p_hash text)
returns integer
language sql
set search_path = public
as $$
  update public.users set recovery_codes = recovery_codes - p_hash
  where id = p_user and recovery_codes ? p_hash
  returning jsonb_array_length(recovery_codes);
$$;

revoke all on function public.staff_pakai_langkah_totp(uuid, bigint) from public, anon, authenticated;
revoke all on function public.staff_pakai_kode_cadangan(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_pakai_langkah_totp(uuid, bigint) to service_role;
grant execute on function public.staff_pakai_kode_cadangan(uuid, text) to service_role;

comment on column public.users.totp_secret is 'Rahasia authenticator, tersandi AES-256-GCM. Tidak pernah dikirim ke peramban setelah setup.';

commit;

notify pgrst, 'reload schema';

-- Pemeriksaan sesudah (jalankan terpisah). Sebelum migrasi semuanya false, bukan galat.
--
-- select
--   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'password_hash') as kolom_sandi,
--   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'totp_secret') as kolom_totp,
--   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'recovery_codes') as kolom_cadangan,
--   exists (select 1 from pg_constraint where conname = 'users_totp_pair') as aturan_totp,
--   coalesce(has_function_privilege('service_role', to_regprocedure('public.staff_pakai_langkah_totp(uuid,bigint)'), 'execute'), false) as rpc_totp,
--   coalesce(has_function_privilege('service_role', to_regprocedure('public.staff_pakai_kode_cadangan(uuid,text)'), 'execute'), false) as rpc_cadangan,
--   coalesce(not has_function_privilege('anon', to_regprocedure('public.staff_pakai_kode_cadangan(uuid,text)'), 'execute'), false) as rpc_anon_ditolak;
