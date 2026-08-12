-- ============================================================================
-- Scope event pada RPC undian.
--
-- DIUKUR sebelum perbaikan: dengan event kedua aktif, `undian_participant_pool()`
-- naik 247 -> 248 dan peserta event lain IKUT MASUK POOL. Artinya undian bisa
-- menarik pemenang dari event lain, di atas panggung, tanpa satu pun galat.
--
-- Versi lama DI-DROP, bukan dibiarkan sebagai overload. Pelajaran dari
-- get_leaderboard: parameter berdefault membuat signature lama TETAP ADA, bisa
-- dipanggil tanpa scope, dan pemanggilan berargumen bisa jadi ambigu (42725).
--
-- Setelah perbaikan (diuji dalam transaksi rollback):
--   pool event1 247 -> 247 (tidak bergerak saat event2 ditambah)
--   pool event1 memuat peserta event2? false
--   pool event2 = 1, berisi pesertanya sendiri
--   tanpa argumen saat 2 event aktif: DITOLAK P0009
-- ============================================================================

drop function if exists public.undian_participant_pool();
drop function if exists public.undian_blocking_winner_ids(integer, text);
drop function if exists public.undian_session_summary();

create function public.undian_participant_pool(p_event_id uuid default null)
returns table(participant_id uuid, name text, company text, title text, qr_code text,
  participant_type text, rsvp_status text, checked_in boolean, scan_count integer,
  seat_label text, allow_name_display boolean, total_spend bigint, booth_count integer,
  already_won integer, manually_excluded boolean, exclusion_reason text)
language plpgsql stable security definer set search_path=public as $$
declare v_event uuid := public.resolve_event_id(p_event_id);
begin
  return query
  with spend as (
    select o.participant_id,
      coalesce(sum(o.regular_amount),0)::bigint
        + coalesce(sum((select coalesce(sum(i.price_at_claim),0) from public.order_special_items i
            where i.order_id=o.id and i.counts_toward_leaderboard)),0)::bigint as total_spend,
      count(distinct o.booth_id)::int as booth_count
    from public.orders o
    where o.status in ('paid','handed_over') and o.event_id = v_event
    group by o.participant_id
  ), wins as (
    select w.participant_id, count(*)::int as already_won
    from public.undian_winners w
    where w.participant_id is not null and w.status <> 'rejected' and w.event_id = v_event
    group by w.participant_id
  )
  -- MENANDAI, bukan memfilter (manually_excluded / exclusion_reason), supaya CMS
  -- bisa menjelaskan komposisi pool: "249 total, 12 oleh aturan, 3 manual, ...".
  select p.id, p.name, p.company, p.title, p.qr_code, p.participant_type, p.rsvp_status,
    p.source_checked_in, p.source_total_scans,
    nullif(trim(coalesce(p.seats->0->>'label','')),''), p.allow_name_display,
    coalesce(s.total_spend,0), coalesce(s.booth_count,0), coalesce(w.already_won,0),
    x.participant_id is not null, x.reason
  from public.participants p
  left join spend s on s.participant_id = p.id
  left join wins  w on w.participant_id = p.id
  left join public.undian_exclusions x on x.participant_id = p.id and x.event_id = v_event
  where p.source_removed_at is null and p.event_id = v_event
  order by p.name;
end $$;

create function public.undian_blocking_winner_ids(p_prize_id integer, p_scope text, p_event_id uuid default null)
returns table(participant_id uuid, entry_id bigint)
language plpgsql stable security definer set search_path=public as $$
declare v_event uuid := public.resolve_event_id(p_event_id);
begin
  return query
  select w.participant_id, w.entry_id
  from public.undian_winners w
  left join public.undian_sessions s on s.id = w.session_id
  where w.event_id = v_event
    and w.status <> 'rejected'
    and (p_scope <> 'this_prize' or w.prize_id = p_prize_id)
    -- session_id null = ditarik sebelum fitur sesi ada; tetap memblokir.
    and (w.session_id is null or s.status = 'active');
end $$;

create function public.undian_session_summary(p_event_id uuid default null)
returns table(session_id integer, name text, note text, status text,
  started_at timestamptz, closed_at timestamptz, closed_by_username text,
  prize_count bigint, draw_count bigint, winner_total bigint, winner_confirmed bigint,
  winner_pending bigint, winner_rejected bigint, first_draw_at timestamptz, last_draw_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
declare v_event uuid := public.resolve_event_id(p_event_id);
begin
  return query
  select s.id, s.name, s.note, s.status, s.started_at, s.closed_at, u.username,
    count(distinct w.prize_id),
    count(distinct (w.prize_id::text || '-' || w.draw_round::text)),
    count(w.id),
    count(w.id) filter (where w.status='confirmed'),
    count(w.id) filter (where w.status='pending'),
    count(w.id) filter (where w.status='rejected'),
    min(w.drawn_at), max(w.drawn_at)
  from public.undian_sessions s
  left join public.undian_winners w on w.session_id = s.id and w.event_id = v_event
  left join public.users u on u.id = s.closed_by
  where s.event_id = v_event
  group by s.id, s.name, s.note, s.status, s.started_at, s.closed_at, u.username
  order by s.started_at desc;
end $$;

revoke all on function public.undian_participant_pool(uuid) from public, anon, authenticated;
revoke all on function public.undian_blocking_winner_ids(integer, text, uuid) from public, anon, authenticated;
revoke all on function public.undian_session_summary(uuid) from public, anon, authenticated;
