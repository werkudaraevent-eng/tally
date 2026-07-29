-- Pengaman: cakupan penawaran bawaan booth tidak boleh berubah.
--
-- Guard di API sudah menolaknya, tapi database menerimanya. Terbukti lewat uji:
-- `update special_offers set scope='global', booth_id=null where code='booth_2_diskon'`
-- BERHASIL, dan akibatnya permanen:
--   - Baris tersangkut `scope=global, booth_id=NULL`.
--   - Trigger sync_booth_builtin_offer TIDAK dapat memulihkannya, karena klausa
--     `on conflict do update` tidak menyertakan scope maupun booth_id.
--   - Item diskon booth itu lalu muncul di SEMUA booth, bukan booth asalnya.
--
-- Karena tidak ada jalan pulih otomatis, pencegahannya harus di database — bukan
-- hanya di satu jalur API yang kebetulan sedang dipakai.
--
-- Penawaran non-builtin tetap bebas berubah cakupan selama belum diklaim; batasan
-- itu ditegakkan di API karena butuh menghitung baris klaim.
create or replace function public.guard_builtin_offer_scope()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.is_builtin then
    if new.scope <> old.scope then
      raise exception using errcode = '23514',
        message = 'OFFER_SCOPE_LOCKED_BUILTIN: cakupan penawaran bawaan booth tidak dapat diubah';
    end if;
    if coalesce(new.booth_id, -1) <> coalesce(old.booth_id, -1) then
      raise exception using errcode = '23514',
        message = 'OFFER_SCOPE_LOCKED_BUILTIN: penawaran bawaan booth tidak dapat dipindah ke booth lain';
    end if;
    -- is_builtin sendiri juga dikunci: melepasnya akan membuka celah yang sama
    -- lewat dua langkah (lepas flag, lalu ubah cakupan).
    if not new.is_builtin then
      raise exception using errcode = '23514',
        message = 'OFFER_SCOPE_LOCKED_BUILTIN: status bawaan booth tidak dapat dilepas';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists special_offers_guard_builtin_scope on public.special_offers;
create trigger special_offers_guard_builtin_scope
  before update of scope, booth_id, is_builtin on public.special_offers
  for each row execute function public.guard_builtin_offer_scope();

revoke all on function public.guard_builtin_offer_scope() from public, anon, authenticated;
grant execute on function public.guard_builtin_offer_scope() to service_role;
