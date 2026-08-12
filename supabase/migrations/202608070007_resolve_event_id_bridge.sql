-- Jembatan RPC lama: null hanya boleh di-resolve bila tepat satu event aktif.
-- Dengan >1 aktif, jangan menebak event terbaru; error eksplisit mencegah write
-- diam-diam ke event yang salah.
create or replace function public.resolve_event_id(p_event_id uuid)
returns uuid language plpgsql stable security definer set search_path=public as $$
declare v_id uuid; v_count int;
begin
  if p_event_id is not null then
    if not exists (select 1 from public.events where id=p_event_id) then
      raise exception using errcode='P0009',message='EVENT_NOT_FOUND';
    end if;
    return p_event_id;
  end if;
  select count(*) into v_count from public.events where status='active';
  if v_count=1 then select id into v_id from public.events where status='active'; return v_id; end if;
  if v_count=0 then raise exception using errcode='P0009',message='NO_ACTIVE_EVENT'; end if;
  raise exception using errcode='P0009',message='EVENT_REQUIRED_MULTIPLE_ACTIVE';
end $$;
revoke all on function public.resolve_event_id(uuid) from public,anon,authenticated;
