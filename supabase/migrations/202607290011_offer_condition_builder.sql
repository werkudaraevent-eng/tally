-- Rule builder untuk syarat penawaran spesial.
--
-- Masalah yang diperbaiki:
-- 1. `min_accumulated_amount` cuma satu angka tanpa keterangan cakupan. Di UI
--    labelnya "Syarat total transaksi" — admin tidak bisa tahu itu total di SEMUA
--    booth atau di booth ini saja. Bukan ambiguitas kosmetik: ada peserta nyata
--    dengan total 1.320.000 lintas 4 booth tapi hanya 470.000 di booth tertinggi,
--    jadi dengan ambang 500rb dia LOLOS bila dihitung semua booth dan GAGAL bila
--    per booth. Salah tafsir = salah setel tanpa admin sadar.
-- 2. Satu angka tidak bisa menyatakan syarat gabungan (mis. "total >= 500rb DAN
--    tipe peserta Delegates", atau "kunjungi 3 booth ATAU belanja 1 juta").
--
-- Diganti kolom `conditions jsonb` berisi pohon kondisi dengan grup AND/OR.
-- Kolom `min_accumulated_amount` DIHAPUS, tidak disimpan berdampingan: dua sumber
-- kebenaran untuk aturan yang sama adalah persis masalah yang baru saja
-- dikeluhkan pada konfigurasi booth vs item spesial.
--
-- Bentuk data:
--   { "op": "and", "children": [
--       { "var": "total_spend", "scope": "all_booths", "cmp": "gte", "value": 500000 },
--       { "op": "or", "children": [
--           { "var": "booth_count", "cmp": "gte", "value": 3 },
--           { "var": "participant_type", "cmp": "in", "values": ["Delegates"] }
--       ]}
--   ]}
--
-- children kosong = tanpa syarat (penawaran terbuka untuk semua).

alter table public.special_offers
  add column if not exists conditions jsonb not null default '{"op":"and","children":[]}'::jsonb;

-- Validasi bentuk tingkat atas saja. Validasi rekursif penuh dilakukan zod di
-- lapisan API; CHECK yang terlalu pintar sulit di-debug saat gagal di hari-H.
alter table public.special_offers
  drop constraint if exists special_offers_conditions_shape;
alter table public.special_offers
  add constraint special_offers_conditions_shape check (
    conditions ? 'op'
    and conditions->>'op' in ('and', 'or')
    and jsonb_typeof(conditions->'children') = 'array'
  );

-- Pindahkan syarat lama ke bentuk baru sebelum kolomnya dihapus.
update public.special_offers
set conditions = jsonb_build_object(
      'op', 'and',
      'children', jsonb_build_array(
        jsonb_build_object('var', 'total_spend', 'scope', 'all_booths', 'cmp', 'gte', 'value', min_accumulated_amount)
      ))
where min_accumulated_amount is not null;

-- ---------------------------------------------------------------------------
-- Pembaca variabel
-- ---------------------------------------------------------------------------
-- Semua memakai order paid/handed_over saja, definisi yang sama dengan
-- leaderboard, agar syarat penawaran dan angka top spender tidak pernah beda.

create or replace function public.participant_spend(p_participant_id uuid, p_scope text, p_booth_id integer)
returns bigint
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(sum(o.regular_amount), 0)::bigint
       + coalesce(sum((
           select coalesce(sum(i.price_at_claim), 0)
           from public.order_special_items i
           where i.order_id = o.id and i.counts_toward_leaderboard
         )), 0)::bigint
  from public.orders o
  where o.participant_id = p_participant_id
    and o.status in ('paid', 'handed_over')
    and (p_scope = 'all_booths' or o.booth_id = p_booth_id);
$function$;

create or replace function public.participant_booth_count(p_participant_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select count(distinct o.booth_id)::int
  from public.orders o
  where o.participant_id = p_participant_id
    and o.status in ('paid', 'handed_over');
$function$;

-- ---------------------------------------------------------------------------
-- Evaluator rekursif
-- ---------------------------------------------------------------------------
-- Mengembalikan { passed, failed: [ {var, cmp, value, actual, ...} ] }.
-- Daftar `failed` dipakai layar booth untuk menjelaskan ke peserta syarat mana
-- yang belum terpenuhi, bukan sekadar "tidak tersedia".
--
-- p_booth_id dipakai scope 'this_booth'. Node `scope: 'booth'` dengan
-- `booth_id` eksplisit menimpanya, untuk syarat lintas-booth spesifik.
create or replace function public.evaluate_offer_conditions(
  p_participant_id uuid,
  p_booth_id integer,
  p_node jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  child jsonb;
  child_result jsonb;
  failures jsonb := '[]'::jsonb;
  any_passed boolean := false;
  all_passed boolean := true;
  child_count int := 0;
  op text;
  actual numeric;
  actual_text text;
  passed boolean;
  scope text;
  target_booth int;
begin
  if p_node is null then
    return jsonb_build_object('passed', true, 'failed', '[]'::jsonb);
  end if;

  op := p_node->>'op';

  -- Node grup
  if op in ('and', 'or') then
    for child in select * from jsonb_array_elements(coalesce(p_node->'children', '[]'::jsonb)) loop
      child_count := child_count + 1;
      child_result := public.evaluate_offer_conditions(p_participant_id, p_booth_id, child);
      if (child_result->>'passed')::boolean then
        any_passed := true;
      else
        all_passed := false;
        failures := failures || (child_result->'failed');
      end if;
    end loop;

    -- Grup kosong tidak boleh memblokir: penawaran tanpa syarat harus terbuka.
    if child_count = 0 then
      return jsonb_build_object('passed', true, 'failed', '[]'::jsonb);
    end if;

    if op = 'and' then
      return jsonb_build_object('passed', all_passed, 'failed', case when all_passed then '[]'::jsonb else failures end);
    else
      -- OR: cukup satu lolos. Kalau semua gagal, laporkan seluruh alternatif
      -- supaya staf booth dapat menyebutkan pilihan yang tersedia.
      return jsonb_build_object('passed', any_passed, 'failed', case when any_passed then '[]'::jsonb else failures end);
    end if;
  end if;

  -- Node daun
  case p_node->>'var'
    when 'total_spend' then
      scope := coalesce(p_node->>'scope', 'all_booths');
      target_booth := case
        when scope = 'this_booth' then p_booth_id
        when scope = 'booth' then (p_node->>'booth_id')::int
        else null
      end;
      actual := public.participant_spend(p_participant_id, case when scope = 'all_booths' then 'all_booths' else 'booth' end, target_booth);
    when 'booth_count' then
      actual := public.participant_booth_count(p_participant_id);
    when 'participant_type' then
      select p.participant_type into actual_text from public.participants p where p.id = p_participant_id;
    else
      -- Variabel tak dikenal diperlakukan GAGAL, bukan lolos. Kalau lolos, salah
      -- tulis konfigurasi akan diam-diam membuka penawaran untuk semua orang.
      return jsonb_build_object('passed', false, 'failed',
        jsonb_build_array(jsonb_build_object('var', coalesce(p_node->>'var', 'unknown'), 'reason', 'UNKNOWN_VARIABLE')));
  end case;

  if p_node->>'var' = 'participant_type' then
    passed := case p_node->>'cmp'
      when 'in' then coalesce(actual_text = any (select jsonb_array_elements_text(coalesce(p_node->'values', '[]'::jsonb))), false)
      when 'not_in' then not coalesce(actual_text = any (select jsonb_array_elements_text(coalesce(p_node->'values', '[]'::jsonb))), false)
      else false
    end;
    return jsonb_build_object(
      'passed', passed,
      'failed', case when passed then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
        'var', 'participant_type', 'cmp', p_node->>'cmp',
        'values', coalesce(p_node->'values', '[]'::jsonb), 'actual', actual_text)) end);
  end if;

  passed := case p_node->>'cmp'
    when 'gte' then actual >= (p_node->>'value')::numeric
    when 'gt'  then actual >  (p_node->>'value')::numeric
    when 'lte' then actual <= (p_node->>'value')::numeric
    when 'lt'  then actual <  (p_node->>'value')::numeric
    when 'eq'  then actual =  (p_node->>'value')::numeric
    else false
  end;

  return jsonb_build_object(
    'passed', passed,
    'failed', case when passed then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'var', p_node->>'var',
      'scope', p_node->>'scope',
      'booth_id', p_node->>'booth_id',
      'cmp', p_node->>'cmp',
      'value', (p_node->>'value')::numeric,
      'actual', actual)) end);
end;
$function$;

-- ---------------------------------------------------------------------------
-- get_available_offers: kirim hasil evaluasi kondisi
-- ---------------------------------------------------------------------------
create or replace function public.get_available_offers(p_participant_id uuid, p_booth_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  accumulated bigint;
  result jsonb;
begin
  accumulated := public.participant_accumulated_amount(p_participant_id);

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order), '[]'::jsonb) into result
  from (
    select
      so.id, so.code, so.name, so.price, so.scope, so.booth_id, so.stock,
      so.max_per_participant, so.conditions, so.counts_toward_leaderboard,
      so.is_builtin, so.sort_order,
      (select count(*) from public.order_special_items i
         join public.orders o on o.id = i.order_id
        where i.offer_id = so.id and o.participant_id = p_participant_id and o.status <> 'void') as claimed,
      accumulated as accumulated_amount,
      public.evaluate_offer_conditions(p_participant_id, p_booth_id, so.conditions) as condition_result,
      case
        when (select count(*) from public.order_special_items i
                join public.orders o on o.id = i.order_id
               where i.offer_id = so.id and o.participant_id = p_participant_id and o.status <> 'void')
             >= so.max_per_participant then 'QUOTA_REACHED'
        when so.stock is not null and so.stock <= 0 then 'OUT_OF_STOCK'
        when not (public.evaluate_offer_conditions(p_participant_id, p_booth_id, so.conditions)->>'passed')::boolean
          then 'CONDITIONS_NOT_MET'
        else null
      end as blocked_reason
    from public.special_offers so
    where so.is_active
      and (so.scope = 'global' or so.booth_id = p_booth_id)
  ) x;

  return jsonb_build_object('accumulated_amount', accumulated, 'offers', result);
end;
$function$;

-- ---------------------------------------------------------------------------
-- create_order_transaction: pakai evaluator, bukan satu angka
-- ---------------------------------------------------------------------------
create or replace function public.create_order_transaction(
  p_code text,
  p_participant_id uuid,
  p_booth_id integer,
  p_has_discount_item boolean,
  p_regular_amount integer,
  p_note text,
  p_created_by uuid,
  p_offer_codes text[] default null
)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  booth_row public.booths;
  settings_row public.event_settings;
  new_order public.orders;
  initial_status public.order_status := 'pending';
  auto_settle boolean := false;
  offer_codes text[];
  offer_row public.special_offers;
  code_item text;
  special_total int := 0;
  claims_count int;
  builtin_claimed boolean := false;
  cond_result jsonb;
begin
  if p_regular_amount < 0 then raise exception using errcode = '22023', message = 'INVALID_AMOUNT'; end if;
  if p_code !~ '^B[1-9][0-9]*-[0-9]{3}$' then raise exception using errcode = '22023', message = 'INVALID_ORDER_CODE'; end if;
  if exists (select 1 from public.orders where code = upper(trim(p_code))) then raise exception using errcode = 'P0005', message = 'ORDER_CODE_USED'; end if;

  -- Peserta dikunci lebih dulu, lalu booth. Penawaran global tidak terlindungi
  -- lock booth (booth berbeda = baris berbeda), jadi tanpa lock peserta klaim
  -- ganda di dua booth bisa lolos bersamaan. Urutan tetap mencegah deadlock.
  perform 1 from public.participants where id = p_participant_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'PARTICIPANT_NOT_FOUND'; end if;

  select * into booth_row from public.booths where id = p_booth_id and is_active = true for update;
  if not found then raise exception using errcode = 'P0003', message = 'BOOTH_NOT_FOUND'; end if;
  select * into settings_row from public.event_settings where id = 1;

  offer_codes := coalesce(p_offer_codes, '{}'::text[]);
  if array_length(offer_codes, 1) is null and p_has_discount_item then
    select array_agg(so.code) into offer_codes
    from public.special_offers so where so.booth_id = p_booth_id and so.is_builtin;
    offer_codes := coalesce(offer_codes, '{}'::text[]);
  end if;

  if not settings_row.cashier_confirmation_required then
    auto_settle := true;
    initial_status := case when settings_row.pickup_mode = 'immediate' then 'handed_over'::public.order_status else 'paid'::public.order_status end;
  end if;

  foreach code_item in array offer_codes loop
    select * into offer_row from public.special_offers where code = code_item for update;
    if not found then raise exception using errcode = 'P0006', message = 'OFFER_NOT_FOUND'; end if;
    if not offer_row.is_active then raise exception using errcode = 'P0006', message = 'OFFER_INACTIVE'; end if;
    if offer_row.scope = 'per_booth' and offer_row.booth_id <> p_booth_id then
      raise exception using errcode = 'P0006', message = 'OFFER_WRONG_BOOTH';
    end if;

    select count(*) into claims_count
    from public.order_special_items i
    join public.orders o on o.id = i.order_id
    where i.offer_id = offer_row.id and o.participant_id = p_participant_id and o.status <> 'void';
    if claims_count >= offer_row.max_per_participant then
      raise exception using errcode = 'P0006', message = 'DISCOUNT_ALREADY_TAKEN';
    end if;

    -- Syarat dievaluasi di server, bukan dipercaya dari klien.
    cond_result := public.evaluate_offer_conditions(p_participant_id, p_booth_id, offer_row.conditions);
    if not (cond_result->>'passed')::boolean then
      raise exception using errcode = 'P0006', message = 'OFFER_CONDITIONS_NOT_MET';
    end if;

    if offer_row.stock is not null then
      if offer_row.stock <= 0 then raise exception using errcode = 'P0004', message = 'DISCOUNT_OUT_OF_STOCK'; end if;
      update public.special_offers set stock = stock - 1 where id = offer_row.id;
      if offer_row.is_builtin then
        update public.booths set discount_item_stock = discount_item_stock - 1
        where id = offer_row.booth_id and discount_item_stock is not null;
      end if;
    end if;

    special_total := special_total + offer_row.price;
    if offer_row.is_builtin then builtin_claimed := true; end if;
  end loop;

  insert into public.orders (
    code, participant_id, booth_id, has_discount_item, regular_amount, total_amount,
    status, pickup_mode, note, created_by, auto_settled,
    payment_method, paid_at, paid_by, handed_over_at, handed_over_by
  )
  values (
    upper(trim(p_code)), p_participant_id, p_booth_id, builtin_claimed, p_regular_amount, p_regular_amount + special_total,
    initial_status, settings_row.pickup_mode, nullif(trim(p_note), ''), p_created_by, auto_settle,
    null,
    case when auto_settle then now() else null end,
    case when auto_settle then p_created_by else null end,
    case when auto_settle and initial_status = 'handed_over' then now() else null end,
    case when auto_settle and initial_status = 'handed_over' then p_created_by else null end
  )
  returning * into new_order;

  foreach code_item in array offer_codes loop
    select * into offer_row from public.special_offers where code = code_item;
    insert into public.order_special_items (order_id, offer_id, price_at_claim, counts_toward_leaderboard)
    values (new_order.id, offer_row.id, offer_row.price, offer_row.counts_toward_leaderboard);
  end loop;

  insert into public.audit_logs (order_id, user_id, action, payload)
  values (new_order.id, p_created_by, 'create', jsonb_build_object(
    'code', new_order.code, 'pickup_mode', new_order.pickup_mode,
    'has_discount_item', new_order.has_discount_item, 'auto_settled', auto_settle,
    'status', initial_status, 'offers', offer_codes, 'special_total', special_total));

  if auto_settle then
    insert into public.audit_logs (order_id, user_id, action, payload)
    values (new_order.id, p_created_by, 'pay', jsonb_build_object('automatic', true, 'status', initial_status, 'payment_method', null));
  end if;

  return new_order;

exception when unique_violation then
  if sqlerrm like '%orders_code_key%' or sqlerrm like '%orders_code%' then
    raise exception using errcode = 'P0005', message = 'ORDER_CODE_USED';
  end if;
  raise exception using errcode = 'P0006', message = 'DISCOUNT_ALREADY_TAKEN';
end;
$function$;

-- Kolom lama dihapus SETELAH semua fungsi berhenti memakainya. Satu sumber
-- kebenaran saja untuk syarat penawaran.
alter table public.special_offers drop column if exists min_accumulated_amount;

-- Trigger sinkronisasi booth tidak boleh menyentuh `conditions`: kolom itu hanya
-- ada di halaman Item spesial dan tidak punya padanan di tabel booths.
revoke all on function public.participant_spend(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.participant_booth_count(uuid) from public, anon, authenticated;
revoke all on function public.evaluate_offer_conditions(uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.get_available_offers(uuid, integer) from public, anon, authenticated;
revoke all on function public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid, text[]) from public, anon, authenticated;
grant execute on function public.participant_spend(uuid, text, integer) to service_role;
grant execute on function public.participant_booth_count(uuid) to service_role;
grant execute on function public.evaluate_offer_conditions(uuid, integer, jsonb) to service_role;
grant execute on function public.get_available_offers(uuid, integer) to service_role;
grant execute on function public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid, text[]) to service_role;
