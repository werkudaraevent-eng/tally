-- SECURITY FIX lanjutan dari 202607280009.
--
-- Migrasi 202607290004/0005/0007 menulis `revoke all on function ... from anon`.
-- Itu TIDAK mencabut apa pun: Postgres memberikan EXECUTE ke PUBLIC secara default
-- (terlihat sebagai `=X/postgres` di proacl), bukan ke role `anon` spesifik.
-- Mencabut dari `anon` saja meninggalkan grant PUBLIC utuh, sehingga siapa pun
-- yang memegang publishable key dapat memanggil fungsi ini langsung lewat
-- /rest/v1/rpc dan melewati pemeriksaan sesi + role di lapisan API Next.js.
--
-- Dampak nyata sebelum perbaikan ini: create_order_transaction, void_order_transaction,
-- dan settle_orders_transaction dapat dipanggil tanpa login sama sekali.
--
-- Pola yang benar (sama dengan 202607280009): revoke dari public, anon, authenticated
-- lalu grant ulang HANYA ke service_role.
--
-- Signature dibangun dinamis dari katalog agar tidak salah tulis argumen dan tetap
-- benar walau signature berubah di masa depan.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef                     -- hanya SECURITY DEFINER
      and p.proacl is not null            -- ACL default sudah aman
      -- Cari yang masih memberi EXECUTE ke PUBLIC / anon / authenticated.
      and exists (
        select 1 from unnest(p.proacl) acl
        where acl::text like '=X/%'
           or acl::text like 'anon=%'
           or acl::text like 'authenticated=%'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end;
$$;
