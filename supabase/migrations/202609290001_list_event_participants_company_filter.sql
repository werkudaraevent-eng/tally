-- ---------------------------------------------------------------------------
-- list_event_participants: tambah saringan perusahaan (p_companies).
--
-- Signature lama DI-DROP lebih dulu. Menambah parameter berdefault tanpa drop
-- membuat OVERLOAD: versi lama tetap bisa dipanggil dan pemanggil lama jadi
-- ambigu (42725). Lihat jebakan #3 di STATUS-MULTI-EVENT.md.
--
-- Nilai '' di p_companies berarti "tanpa perusahaan" (company null atau kosong).
-- Parameter baru ada di UJUNG dengan default null, jadi route yang belum
-- mengirimnya tetap memanggil fungsi ini dengan benar.
-- ---------------------------------------------------------------------------

drop function if exists public.list_event_participants(uuid, text, text, bigint, text, text, text, text, int, int);

create or replace function public.list_event_participants(
  p_event_id uuid,
  p_q text default '',
  p_source text default null,
  p_session bigint default null,
  p_attended text default null,
  p_rsvp text default null,
  p_sort text default 'name',
  p_dir text default 'asc',
  p_limit int default 25,
  p_offset int default 0,
  p_companies text[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sort text;
  v_dir text;
  v_rows jsonb;
  v_total int;
begin
  v_sort := case p_sort
    when 'company' then 'company'
    when 'title' then 'title'
    when 'qr_code' then 'qr_code'
    when 'participant_type' then 'participant_type'
    when 'rsvp_status' then 'rsvp_status'
    when 'source_checked_in' then 'source_checked_in'
    when 'source_total_scans' then 'source_total_scans'
    else 'name'
  end;
  v_dir := case when lower(coalesce(p_dir, 'asc')) = 'desc' then 'DESC' else 'ASC' end;

  execute format($sql$
    with dasar as (
      select p.id, p.qr_code, p.name, p.company, p.title, p.email, p.phone,
             p.participant_type, p.rsvp_status, p.extra, p.source_participant_id,
             p.source_checked_in, p.source_total_scans, p.source_synced_at,
             p.source_removed_at, p.walk_in_at, p.seats,
             case
               when p.walk_in_at is not null then 'walkin'
               when p.source_participant_id is not null then 'scanner'
               when exists (
                 select 1 from public.event_registrations r
                  where r.event_id = p.event_id and r.participant_id = p.id
               ) then 'registration'
               else 'manual'
             end as source
        from public.participants p
       where p.event_id = $1::uuid
    ),
    disaring as (
      select * from dasar d
       where (
               $2::text = ''
               or d.name ilike '%%' || $2::text || '%%'
               or d.qr_code ilike '%%' || $2::text || '%%'
               or coalesce(d.company, '') ilike '%%' || $2::text || '%%'
             )
         and ($3::text is null or d.source = $3::text)
         and (
               $6::text is null
               or ($6::text = 'none' and d.rsvp_status is null)
               or d.rsvp_status = $6::text
             )
         and (
               $4::bigint is null or $5::text is null
               or ($5::text = 'yes' and exists (
                     select 1 from public.attendance_scans s
                      where s.session_id = $4::bigint and s.participant_id = d.id))
               or ($5::text = 'no' and not exists (
                     select 1 from public.attendance_scans s
                      where s.session_id = $4::bigint and s.participant_id = d.id))
             )
         and (
               $9::text[] is null
               or cardinality($9::text[]) = 0
               or coalesce(btrim(d.company), '') = any($9::text[])
             )
    )
    select coalesce(jsonb_agg(halaman.isi order by halaman.urut), '[]'::jsonb),
           coalesce(max(halaman.total), 0)
      from (
        select to_jsonb(d) || jsonb_build_object(
                 'attendance',
                 coalesce((
                   select jsonb_object_agg(a.session_id::text,
                            jsonb_build_object('count', a.n, 'first', a.f))
                     from (select s.session_id, count(*) as n, min(s.scanned_at) as f
                             from public.attendance_scans s
                            where s.participant_id = d.id
                            group by s.session_id) a
                 ), '{}'::jsonb)
               ) as isi,
               row_number() over (order by d.%I %s nulls last, d.name asc) as urut,
               count(*) over () as total
          from disaring d
         order by d.%I %s nulls last, d.name asc
         limit $7::int offset $8::int
      ) halaman
  $sql$, v_sort, v_dir, v_sort, v_dir)
  using p_event_id, coalesce(p_q, ''), p_source, p_session, p_attended, p_rsvp, p_limit, p_offset, p_companies
  into v_rows, v_total;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

revoke all on function public.list_event_participants(uuid, text, text, bigint, text, text, text, text, int, int, text[])
  from public, anon, authenticated;
grant execute on function public.list_event_participants(uuid, text, text, bigint, text, text, text, text, int, int, text[])
  to service_role;
