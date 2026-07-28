-- Harden scheduled pending-order cleanup.
create or replace function public.auto_void_expired_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.orders
  set status = 'void',
      void_reason = 'Auto-void: melewati batas waktu pembayaran',
      voided_at = now()
  where status = 'pending'
    and created_at <= now() - make_interval(mins => (
      select pending_auto_void_minutes from public.event_settings where id = 1
    ));
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.auto_void_expired_orders() from public;
grant execute on function public.auto_void_expired_orders() to service_role;
