-- ============================================================================
-- Scope event pada RPC leaderboard.
--
-- DIUKUR sebelum perbaikan, dengan dua event aktif dan satu order
-- Rp 999.999.999 di event kedua:
--   get_leaderboard  baris 70 -> 71, tertinggi 4.380.081 -> 999.999.999
--   peserta event lain MUNCUL di leaderboard = true
--   peserta event lain MUNCUL di pool undian = true
-- Artinya papan proyektor menampilkan peserta event lain sebagai peringkat 1
-- tanpa satu pun galat. Kelas bug terburuk di repo ini: salah, terlihat normal,
-- dan tampil di depan audiens.
--
-- Versi lama DI-DROP, bukan dibiarkan sebagai overload. Menambah parameter
-- berdefault membuat signature lama TETAP ADA:
--   * `get_leaderboard(100)` jadi ambigu -> 42725 (terbukti saat pengujian),
--   * dan yang lebih berbahaya, versi TANPA scope event masih bisa dipanggil.
--
-- `p_limit` tetap parameter PERTAMA supaya pemanggilan lama dengan parameter
-- bernama (`{ p_limit }`) tetap cocok. Diverifikasi: 3 endpoint publik produksi
-- tetap 200 dengan panjang respons identik setelah migrasi ini.
-- ============================================================================

drop function if exists public.get_leaderboard(integer);
drop function if exists public.leaderboard_is_excluded(uuid, text);
drop function if exists public.leaderboard_exclusion_impact();
drop function if exists public.leaderboard_exclusion_summary();

create function public.leaderboard_is_excluded(p_event_id uuid, p_participant_id uuid, p_company text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.leaderboard_exclusions x
    where x.event_id = p_event_id and x.is_active
      and (
        x.participant_id = p_participant_id
        or (x.company_keyword is not null and p_company is not null
            and position(lower(btrim(x.company_keyword)) in lower(btrim(p_company))) > 0)
      )
  );
$$;

create function public.get_leaderboard(p_limit integer default 10, p_event_id uuid default null)
returns table(rank bigint, display_name text, company text, total_spent bigint, booth_count bigint)
language plpgsql stable security definer set search_path=public as $$
declare v_event uuid := public.resolve_event_id(p_event_id);
begin
  return query
  with special as (
    -- Nilai item spesial PER ORDER, diagregasi supaya penggabungan di bawah
    -- tetap satu baris per order dan tidak menggandakan regular_amount.
    select i.order_id, sum(i.price_at_claim)::bigint as amount
    from public.order_special_items i
    where i.counts_toward_leaderboard and i.event_id = v_event
    group by i.order_id
  ), totals as (
    select p.id, p.name, p.company, p.allow_name_display,
           sum(o.regular_amount + coalesce(s.amount, 0))::bigint as total_spent,
           count(distinct o.booth_id)::bigint as booth_count,
           row_number() over(
             order by sum(o.regular_amount + coalesce(s.amount, 0)) desc,
                      count(distinct o.booth_id) desc, p.name
           ) as rank
    from public.participants p
    join public.orders o on o.participant_id = p.id and o.event_id = v_event
    left join special s on s.order_id = o.id
    where p.event_id = v_event
      and o.status in ('paid', 'handed_over')
      and not public.leaderboard_is_excluded(v_event, p.id, p.company)
    group by p.id, p.name, p.company, p.allow_name_display
  ), settings as (
    select name_display_mode from public.event_settings where event_id = v_event
  )
  select t.rank,
    case
      when not t.allow_name_display then regexp_replace(t.name, '([[:alpha:]])[^ ]*', '\1.', 'g')
      when s.name_display_mode = 'full' then t.name
      when s.name_display_mode = 'initials' then regexp_replace(t.name, '([[:alpha:]])[^ ]*', '\1.', 'g')
      when s.name_display_mode = 'company_only' then coalesce(t.company, 'Peserta #' || t.rank)
      else 'Peserta #' || t.rank
    end,
    case when s.name_display_mode in ('company_only','hidden') then null else t.company end,
    t.total_spent, t.booth_count
  from totals t cross join settings s
  order by t.rank
  limit greatest(1, least(coalesce(p_limit, 10), 100));
end $$;

-- Kedua fungsi pratinjau CMS memanggil leaderboard_is_excluded, jadi WAJIB ikut
-- diubah dalam migrasi yang SAMA. Kalau tidak, keduanya gagal saat dipanggil —
-- dan kegagalan itu tidak muncul saat migrasi jalan, hanya saat CMS dibuka.
create function public.leaderboard_exclusion_impact(p_event_id uuid default null)
returns table(id integer, matched_participants bigint, matched_spenders bigint)
language plpgsql stable security definer set search_path=public as $$
declare v_event uuid := public.resolve_event_id(p_event_id);
begin
  return query
  select x.id, count(p.id)::bigint,
    count(p.id) filter (where s.participant_id is not null)::bigint
  from public.leaderboard_exclusions x
  left join public.participants p
    on p.event_id = v_event
   and (
      x.participant_id = p.id
      or (x.company_keyword is not null and p.company is not null
          and position(lower(btrim(x.company_keyword)) in lower(btrim(p.company))) > 0)
    )
  left join (
    select distinct o.participant_id from public.orders o
    where o.status in ('paid','handed_over') and o.event_id = v_event
  ) s on s.participant_id = p.id
  where x.event_id = v_event
  group by x.id;
end $$;

create function public.leaderboard_exclusion_summary(p_event_id uuid default null)
returns table(total_spenders bigint, excluded_spenders bigint, remaining_spenders bigint)
language plpgsql stable security definer set search_path=public as $$
declare v_event uuid := public.resolve_event_id(p_event_id);
begin
  return query
  with spenders as (
    select p.id, p.company
    from public.participants p
    where p.event_id = v_event
      and exists (
        select 1 from public.orders o
        where o.participant_id = p.id and o.event_id = v_event
          and o.status in ('paid','handed_over')
      )
  )
  select count(*)::bigint,
    count(*) filter (where public.leaderboard_is_excluded(v_event, id, company))::bigint,
    count(*) filter (where not public.leaderboard_is_excluded(v_event, id, company))::bigint
  from spenders;
end $$;

revoke all on function public.leaderboard_is_excluded(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_leaderboard(integer, uuid) from public, anon, authenticated;
revoke all on function public.leaderboard_exclusion_impact(uuid) from public, anon, authenticated;
revoke all on function public.leaderboard_exclusion_summary(uuid) from public, anon, authenticated;
