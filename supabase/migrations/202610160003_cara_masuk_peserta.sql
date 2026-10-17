-- ---------------------------------------------------------------------------
-- Cara masuk area peserta per acara (Participant area > How participants sign
-- in, landing_config.member.sign_in). Bawaan tetap email + kata sandi; dua
-- cara baru:
--
--   email_code  kode 6 digit ke email setiap kali masuk. Kodenya baris
--               participant_account_tokens berjenis 'kode' (hanya sha256 dari
--               id baris + kode yang disimpan, berlaku 10 menit, sekali pakai,
--               hangus setelah 5 tebakan salah).
--   fields      dua kolom data peserta pilihan admin. Peserta tanpa email pun
--               bisa masuk, jadi participant_accounts.email boleh kosong.
--
-- Tidak ada data yang diubah. Satu transaksi: bila salah satu langkah gagal
-- (mis. lock_timeout), tidak ada yang berubah.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. Token berjenis 'kode', jumlah tebakan salah, dan IP peminta.
alter table public.participant_account_tokens
  drop constraint if exists participant_account_tokens_purpose_check;
alter table public.participant_account_tokens
  add constraint participant_account_tokens_purpose_check
  check (purpose in ('konfirmasi', 'sandi', 'undangan', 'data', 'kode'));

alter table public.participant_account_tokens
  add column if not exists attempts integer not null default 0,
  add column if not exists ip text;

comment on column public.participant_account_tokens.attempts is
  'Tebakan salah untuk kode masuk (purpose kode). Kode hangus (used_at diisi) pada tebakan salah ke-5.';
comment on column public.participant_account_tokens.ip is
  'IP peminta kode masuk. Permintaan dari IP lain tidak membatalkan kode ini.';

-- 2. Akun tanpa email (cara dua kolom) dan akun tanpa kata sandi buatan
--    peserta (kode email / dua kolom: kata sandinya acak). password_set_at
--    kosong = peserta belum pernah membuat kata sandi sendiri, jadi Pesan
--    peserta mengirim tautan buat kata sandi, bukan tautan masuk biasa.
alter table public.participant_accounts
  alter column email drop not null,
  alter column password_set_at drop not null;

comment on column public.participant_accounts.email is
  'Huruf kecil. Kosong hanya untuk akun dari cara masuk dua kolom data peserta, bila pesertanya tanpa email atau emailnya sudah dipakai akun lain.';
comment on column public.participant_accounts.password_set_at is
  'Kapan peserta membuat kata sandinya sendiri. Kosong: akun dari kode email atau dua kolom, kata sandinya acak.';

-- 3. Cara masuk yang membuat sesi. Kosong = email + kata sandi (sesi lama).
--    Sesi dari dua kolom ditolak begitu acaranya pindah ke cara lain.
alter table public.participant_sessions
  add column if not exists cara text;
alter table public.participant_sessions
  drop constraint if exists participant_sessions_cara_check;
alter table public.participant_sessions
  add constraint participant_sessions_cara_check check (cara is null or cara in ('email_code', 'fields'));

-- 4. Pencocokan dua kolom di basis data: satu kueri per percobaan, bukan
--    membaca seluruh daftar peserta ke server. Aturan penyamaan HANYA di sini,
--    dipakai untuk sisi data dan sisi isian, jadi keduanya tidak bisa berbeda.
--      email   huruf kecil, tanpa spasi tepi
--      tel     hanya angka; 62.. dan 8.. disamakan dengan 0..
--      lainnya huruf kecil NFKC, hanya huruf, angka, dan @
create or replace function public.peserta_samakan_isian(p_jenis text, p_nilai text)
returns text
language sql
stable
parallel safe
set search_path = pg_catalog
as $$
  select case
    when p_nilai is null or btrim(p_nilai) = '' then ''
    when p_jenis = 'email' then lower(btrim(p_nilai))
    when p_jenis = 'tel' then (
      select case
        when d like '62%' then '0' || substr(d, 3)
        when d like '8%' then '0' || d
        else d
      end
      from (select regexp_replace(p_nilai, '[^0-9]', '', 'g') as d) angka
    )
    else regexp_replace(normalize(lower(btrim(p_nilai)), NFKC), '[^[:alnum:]@]', '', 'g')
  end
$$;

create or replace function public.peserta_nilai_kolom(p_email text, p_phone text, p_name text, p_extra jsonb, p_kolom text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case
    when p_kolom = 'email' then p_email
    when p_kolom = 'phone' then p_phone
    when p_kolom = 'name' then p_name
    when p_kolom like 'x:%' then p_extra ->> substr(p_kolom, 3)
  end
$$;

-- Paling banyak dua id: dua = kombinasi kembar, tidak bisa dipakai masuk.
create or replace function public.peserta_cocok_kolom(p_event uuid, p_kolom text[], p_jenis text[], p_nilai text[])
returns setof uuid
language sql
stable
set search_path = pg_catalog
as $$
  with isian as (
    select public.peserta_samakan_isian(p_jenis[1], p_nilai[1]) as a,
           public.peserta_samakan_isian(p_jenis[2], p_nilai[2]) as b
  )
  select p.id
  from public.participants p, isian
  where p.event_id = p_event
    and p.source_removed_at is null
    and isian.a <> '' and isian.b <> ''
    and public.peserta_samakan_isian(p_jenis[1], public.peserta_nilai_kolom(p.email, p.phone, p.name, p.extra, p_kolom[1])) = isian.a
    and public.peserta_samakan_isian(p_jenis[2], public.peserta_nilai_kolom(p.email, p.phone, p.name, p.extra, p_kolom[2])) = isian.b
  limit 2
$$;

-- Ringkasan untuk layar admin: semua peserta aktif, yang kedua kolomnya
-- terisi, dan yang berbagi kombinasi dengan peserta lain.
create or replace function public.peserta_ringkas_kolom(p_event uuid, p_kolom text[], p_jenis text[])
returns table (participants bigint, filled bigint, duplicates bigint)
language sql
stable
set search_path = pg_catalog
as $$
  with k as (
    select public.peserta_samakan_isian(p_jenis[1], public.peserta_nilai_kolom(p.email, p.phone, p.name, p.extra, p_kolom[1])) as a,
           public.peserta_samakan_isian(p_jenis[2], public.peserta_nilai_kolom(p.email, p.phone, p.name, p.extra, p_kolom[2])) as b
    from public.participants p
    where p.event_id = p_event and p.source_removed_at is null
  ),
  g as (select count(*) as n from k where a <> '' and b <> '' group by a, b)
  select (select count(*) from k),
         coalesce((select sum(n) from g), 0)::bigint,
         coalesce((select sum(n) from g where n > 1), 0)::bigint
$$;

-- Tebakan kode salah: semua kode hidup yang diuji bertambah satu, hangus di 5.
create or replace function public.peserta_kode_salah(p_ids uuid[])
returns void
language sql
set search_path = pg_catalog
as $$
  update public.participant_account_tokens
  set attempts = attempts + 1,
      used_at = case when attempts + 1 >= 5 then now() else used_at end
  where id = any(p_ids) and purpose = 'kode' and used_at is null
$$;

-- Hanya server (service_role); tidak bisa dipanggil tanpa masuk.
revoke all on function public.peserta_samakan_isian(text, text) from public, anon, authenticated;
revoke all on function public.peserta_nilai_kolom(text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.peserta_cocok_kolom(uuid, text[], text[], text[]) from public, anon, authenticated;
revoke all on function public.peserta_ringkas_kolom(uuid, text[], text[]) from public, anon, authenticated;
revoke all on function public.peserta_kode_salah(uuid[]) from public, anon, authenticated;
grant execute on function public.peserta_samakan_isian(text, text) to service_role;
grant execute on function public.peserta_nilai_kolom(text, text, text, jsonb, text) to service_role;
grant execute on function public.peserta_cocok_kolom(uuid, text[], text[], text[]) to service_role;
grant execute on function public.peserta_ringkas_kolom(uuid, text[], text[]) to service_role;
grant execute on function public.peserta_kode_salah(uuid[]) to service_role;

notify pgrst, 'reload schema';

commit;
