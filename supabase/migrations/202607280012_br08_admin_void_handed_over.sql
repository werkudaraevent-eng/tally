-- BR-08: order tidak bisa di-void jika sudah handed_over, KECUALI oleh role
-- admin dengan alasan wajib diisi.
--
-- Versi sebelumnya hanya mengizinkan status pending/paid, sehingga admin pun
-- tidak dapat memproses refund atas barang yang sudah diserahkan ke peserta.
--
-- p_is_admin dikirim oleh route handler (src/app/api/orders/[id]/void/route.ts)
-- setelah pengecekan role di server. Nilai default false agar pemanggil lama
-- tetap memakai perilaku kasir yang lebih ketat.
drop function if exists public.void_order_transaction(uuid, text, uuid);

create function public.void_order_transaction(
  p_order_id uuid,
  p_reason text,
  p_user_id uuid,
  p_is_admin boolean default false
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  result_order public.orders;
  old_order public.orders;
begin
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'VOID_REASON_REQUIRED';
  end if;

  select * into old_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE';
  end if;

  -- pending/paid: kasir & admin. handed_over: admin saja (BR-08).
  if old_order.status in ('pending', 'paid') then
    null;
  elsif old_order.status = 'handed_over' and p_is_admin then
    null;
  else
    raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE';
  end if;

  update public.orders
  set status = 'void',
      void_reason = trim(p_reason),
      voided_at = now(),
      voided_by = p_user_id
  where id = p_order_id
  returning * into result_order;

  -- BR-02: kuota/stok diskon kembali tersedia setelah void. Stok dikurangi
  -- saat order dibuat, jadi status apa pun selain void layak direstore.
  if old_order.has_discount_item then
    update public.booths
    set discount_item_stock = discount_item_stock + 1
    where id = old_order.booth_id and discount_item_stock is not null;
  end if;

  insert into public.audit_logs (order_id, user_id, action, payload)
  values (p_order_id, p_user_id, 'void', jsonb_build_object(
    'reason', trim(p_reason),
    'previous_status', old_order.status,
    'by_admin', p_is_admin
  ));

  return result_order;
end;
$$;

revoke all on function public.void_order_transaction(uuid, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.void_order_transaction(uuid, text, uuid, boolean) to service_role;
