-- Perbaikan: perusahaan tampil dobel di Live Display dan toggle CMS
-- "Tampilkan perusahaan" (show_company) tidak berpengaruh.
--
-- Penyebab: get_leaderboard menggabungkan nama perusahaan KE DALAM
-- display_name (mis. "Adi Kusma — PT X") sekaligus mengembalikan kolom
-- company. Live Display merender keduanya, sehingga perusahaan selalu muncul
-- walaupun show_company dimatikan.
--
-- Sekarang display_name hanya memuat identitas nama, dan company dikembalikan
-- terpisah agar toggle CMS yang menentukan tampil/tidak.
--
-- BR-13/BR-14 tetap ditegakkan di server:
--   full          -> nama lengkap, company terpisah
--   initials      -> "A. K.", company terpisah
--   company_only  -> perusahaan sebagai display_name, company = NULL
--   hidden        -> "Peserta #n", company = NULL (tidak membocorkan apa pun)
--   allow_name_display = false -> selalu inisial, menang atas setting global
create or replace function public.get_leaderboard(p_limit integer default 10)
returns table(rank bigint, display_name text, company text, total_spent bigint, booth_count bigint)
language sql
security definer
set search_path to 'public'
as $function$
  with totals as (
    select p.id, p.name, p.company, p.allow_name_display,
           sum(o.regular_amount)::bigint as total_spent,
           count(distinct o.booth_id)::bigint as booth_count,
           row_number() over(
             order by sum(o.regular_amount) desc,
                      count(distinct o.booth_id) desc,
                      p.name
           ) as rank
    from public.participants p
    join public.orders o on o.participant_id = p.id
    where o.status in ('paid', 'handed_over')
    group by p.id, p.name, p.company, p.allow_name_display
  ), settings as (
    select name_display_mode from public.event_settings where id = 1
  )
  select
    t.rank,
    case
      when not t.allow_name_display
        then regexp_replace(t.name, '([[:alpha:]])[^ ]*', '\1.', 'g')
      when s.name_display_mode = 'full' then t.name
      when s.name_display_mode = 'initials'
        then regexp_replace(t.name, '([[:alpha:]])[^ ]*', '\1.', 'g')
      when s.name_display_mode = 'company_only'
        then coalesce(t.company, 'Peserta #' || t.rank)
      else 'Peserta #' || t.rank
    end as display_name,
    case
      when s.name_display_mode in ('company_only', 'hidden') then null
      else t.company
    end as company,
    t.total_spent,
    t.booth_count
  from totals t
  cross join settings s
  order by t.rank
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$function$;

revoke all on function public.get_leaderboard(integer) from public, anon, authenticated;
grant execute on function public.get_leaderboard(integer) to service_role;
