-- SECURITY FIX: several SECURITY DEFINER functions were still executable by the
-- public `anon`/`authenticated` Supabase roles, so anyone holding the public
-- publishable key could invoke them directly via /rest/v1/rpc, bypassing the
-- application session + role checks in the Next.js API layer.
--
-- These functions must ONLY ever run through the server-side service-role client.
-- Revoke EXECUTE from anon/authenticated (and public) and re-grant to service_role.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_reset_records(uuid, boolean)',
    'public.admin_upsert_booth(integer, text, text, text, integer, boolean, boolean, integer)',
    'public.rls_auto_enable()'
  ]
  loop
    begin
      execute format('revoke all on function %s from public, anon, authenticated', fn);
      execute format('grant execute on function %s to service_role', fn);
    exception when undefined_function then
      -- Function signature not present in this environment; skip.
      null;
    end;
  end loop;
end;
$$;
