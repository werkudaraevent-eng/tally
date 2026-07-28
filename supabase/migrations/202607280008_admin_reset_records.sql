-- Trial-mode data reset: lets an admin wipe recorded transactional data so the
-- event can be re-run from a clean slate. Deletes orders + audit logs, and can
-- optionally clear the synced participant list. Config (booths, users, settings,
-- display CMS) is preserved. Runs in one transaction so it is all-or-nothing.
create or replace function public.admin_reset_records(
  p_actor uuid,
  p_include_participants boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_orders int := 0;
  deleted_audits int := 0;
  deleted_participants int := 0;
begin
  -- Remove transactional recordings. audit_logs reference orders, so clear them first.
  delete from public.audit_logs where order_id is not null;
  get diagnostics deleted_audits = row_count;

  delete from public.orders;
  get diagnostics deleted_orders = row_count;

  if p_include_participants then
    delete from public.participants;
    get diagnostics deleted_participants = row_count;
  end if;

  insert into public.audit_logs (user_id, action, payload)
  values (
    p_actor,
    'admin_reset_records',
    jsonb_build_object(
      'deleted_orders', deleted_orders,
      'deleted_audits', deleted_audits,
      'deleted_participants', deleted_participants,
      'include_participants', p_include_participants
    )
  );

  return jsonb_build_object(
    'deleted_orders', deleted_orders,
    'deleted_audits', deleted_audits,
    'deleted_participants', deleted_participants
  );
end;
$$;

revoke all on function public.admin_reset_records(uuid, boolean) from public;
grant execute on function public.admin_reset_records(uuid, boolean) to service_role;
