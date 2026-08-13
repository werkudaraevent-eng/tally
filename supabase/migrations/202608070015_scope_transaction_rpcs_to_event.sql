-- Scope event untuk RPC transaksi inti.
--
-- DITEMUKAN saat menguji /booth di browser: `create_order_transaction` masih
-- sepenuhnya lintas event walau route sudah discope. Enam titik bocor:
--   1. cek `orders.code` duplikat tanpa event -> kode B1-001 event A memblok
--      event B. Gejalanya ORDER_CODE_USED untuk kode yang belum pernah dipakai.
--   2. `select ... from event_settings where id = 1` -- PALING BERBAHAYA.
--      Sesudah 202608070004 kolom `id` jadi sequence biasa, jadi `id = 1` berarti
--      "baris pertama yang pernah dibuat", yaitu event LAMA. Event kedua memakai
--      pickup_mode + cashier_confirmation_required milik event pertama: order
--      bisa langsung `handed_over` di event yang mewajibkan konfirmasi kasir.
--      Tidak ada galat sama sekali.
--   3..6. participants / booths / special_offers dicari tanpa event, sehingga
--      order bisa menunjuk peserta atau booth event lain dan klaim penawaran
--      event lain (yang juga MENGURANGI stok event lain).
-- FK komposit menahan sebagian di titik INSERT (23503), tapi pesannya jadi galat
-- database mentah, dan stok penawaran sudah terlanjur berkurang sebelum insert.
--
-- settle/void/hand_over menerima id order dari klien. Route sudah memverifikasi
-- kepemilikan, tapi RPC-nya tetap jalur tulis tanpa pagar: satu pemanggil baru
-- yang lupa memeriksa langsung membuka kebocoran. Pagar dipasang di RPC.
--
-- admin_upsert_booth: `max(id) + 1` dihitung lintas event dan UPDATE `where
-- id = p_id` bisa menimpa booth event lain. Route /api/admin/booths kini memakai
-- insert/update langsung yang sudah discope, jadi fungsi ini tidak dipanggil dari
-- aplikasi; ia DIBUANG supaya tidak ada pintu tulis tanpa event yang tertinggal.

-- ---------------------------------------------------------------------------
-- create_order_transaction
-- ---------------------------------------------------------------------------
-- Menambah parameter berdefault akan menciptakan OVERLOAD, bukan mengganti, dan
-- versi lama tanpa scope tetap bisa dipanggil. Harus di-drop lebih dulu.
drop function if exists public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid, text[]);

create function public.create_order_transaction(
  p_event_id uuid,
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
  participant_row public.participants;
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
  if p_event_id is null then raise exception using errcode = '22023', message = 'EVENT_REQUIRED'; end if;
  if p_regular_amount < 0 then raise exception using errcode = '22023', message = 'INVALID_AMOUNT'; end if;

  if upper(trim(p_code)) !~ '^[A-Z][A-Z0-9]{0,7}-[0-9]{3}$' then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_CODE';
  end if;

  -- Kode order unik PER EVENT (unique (event_id, code) sejak 202608070002).
  if exists (select 1 from public.orders where event_id = p_event_id and code = upper(trim(p_code))) then
    raise exception using errcode = 'P0005', message = 'ORDER_CODE_USED';
  end if;

  select * into participant_row from public.participants
  where id = p_participant_id and event_id = p_event_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'PARTICIPANT_NOT_FOUND'; end if;

  if participant_row.source_removed_at is not null then
    raise exception using errcode = 'P0008', message = 'PARTICIPANT_REMOVED';
  end if;

  select * into booth_row from public.booths
  where id = p_booth_id and event_id = p_event_id and is_active = true for update;
  if not found then raise exception using errcode = 'P0003', message = 'BOOTH_NOT_FOUND'; end if;

  if not booth_row.transactions_enabled and p_regular_amount <> 0 then
    raise exception using errcode = '22023', message = 'BOOTH_WITHOUT_TRANSACTIONS';
  end if;

  if upper(trim(p_code)) !~ ('^' || upper(booth_row.code) || '-[0-9]{3}$') then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_CODE';
  end if;

  -- `id = 1` dulu berarti "satu-satunya baris". Sekarang `id` sebuah sequence,
  -- jadi ia berarti "baris tertua" = event lain.
  select * into settings_row from public.event_settings where event_id = p_event_id;

  offer_codes := coalesce(p_offer_codes, '{}'::text[]);
  if array_length(offer_codes, 1) is null and p_has_discount_item then
    select array_agg(so.code) into offer_codes
    from public.special_offers so
    where so.booth_id = p_booth_id and so.event_id = p_event_id and so.is_builtin;
    offer_codes := coalesce(offer_codes, '{}'::text[]);
  end if;

  if p_regular_amount = 0 and coalesce(array_length(offer_codes, 1), 0) = 0 then
    raise exception using errcode = '22023', message = 'EMPTY_ORDER';
  end if;

  if not settings_row.cashier_confirmation_required then
    auto_settle := true;
    initial_status := case when settings_row.pickup_mode = 'immediate' then 'handed_over'::public.order_status else 'paid'::public.order_status end;
  end if;

  foreach code_item in array offer_codes loop
    select * into offer_row from public.special_offers
    where code = code_item and event_id = p_event_id for update;
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

    cond_result := public.evaluate_offer_conditions(p_participant_id, p_booth_id, offer_row.conditions);
    if not (cond_result->>'passed')::boolean then
      raise exception using errcode = 'P0006', message = 'OFFER_CONDITIONS_NOT_MET';
    end if;

    if offer_row.stock is not null then
      if offer_row.stock <= 0 then raise exception using errcode = 'P0004', message = 'DISCOUNT_OUT_OF_STOCK'; end if;
      update public.special_offers set stock = stock - 1 where id = offer_row.id;
      if offer_row.is_builtin then
        update public.booths set discount_item_stock = discount_item_stock - 1
        where id = offer_row.booth_id and event_id = p_event_id and discount_item_stock is not null;
      end if;
    end if;

    special_total := special_total + offer_row.price;
    if offer_row.is_builtin then builtin_claimed := true; end if;
  end loop;

  insert into public.orders (
    event_id,
    code, participant_id, booth_id, has_discount_item, regular_amount, total_amount,
    status, pickup_mode, note, created_by, auto_settled,
    payment_method, paid_at, paid_by, handed_over_at, handed_over_by
  )
  values (
    p_event_id,
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
    select * into offer_row from public.special_offers where code = code_item and event_id = p_event_id;
    insert into public.order_special_items (event_id, order_id, offer_id, price_at_claim, counts_toward_leaderboard)
    values (p_event_id, new_order.id, offer_row.id, offer_row.price, offer_row.counts_toward_leaderboard);
  end loop;

  insert into public.audit_logs (event_id, order_id, user_id, action, payload)
  values (p_event_id, new_order.id, p_created_by, 'create', jsonb_build_object(
    'code', new_order.code, 'pickup_mode', new_order.pickup_mode,
    'has_discount_item', new_order.has_discount_item, 'auto_settled', auto_settle,
    'status', initial_status, 'offers', offer_codes, 'special_total', special_total));

  if auto_settle then
    insert into public.audit_logs (event_id, order_id, user_id, action, payload)
    values (p_event_id, new_order.id, p_created_by, 'pay', jsonb_build_object('automatic', true, 'status', initial_status, 'payment_method', null));
  end if;

  return new_order;

exception when unique_violation then
  if sqlerrm like '%orders_code_key%' or sqlerrm like '%orders_code%' then
    raise exception using errcode = 'P0005', message = 'ORDER_CODE_USED';
  end if;
  raise exception using errcode = 'P0006', message = 'DISCOUNT_ALREADY_TAKEN';
end;
$function$;

-- ---------------------------------------------------------------------------
-- settle_orders_transaction
-- ---------------------------------------------------------------------------
drop function if exists public.settle_orders_transaction(uuid[], text, text, uuid);

create function public.settle_orders_transaction(
  p_event_id uuid,
  p_order_ids uuid[],
  p_payment_method text,
  p_approval_code text,
  p_paid_by uuid
)
returns setof public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  order_row public.orders;
  next_status public.order_status;
  method_row public.payment_methods;
  cocok int;
begin
  if p_event_id is null then raise exception using errcode = '22023', message = 'EVENT_REQUIRED'; end if;
  if coalesce(array_length(p_order_ids, 1), 0) = 0 then raise exception using errcode = '22023', message = 'NO_ORDERS_SELECTED'; end if;

  -- Membandingkan JUMLAH yang cocok, bukan "ada yang cocok": satu id asing di
  -- dalam array sudah cukup untuk melunasi order event lain.
  select count(*) into cocok from public.orders where id = any(p_order_ids) and event_id = p_event_id;
  if cocok <> coalesce(array_length(p_order_ids, 1), 0) then
    raise exception using errcode = 'P0005', message = 'ORDER_NOT_PENDING';
  end if;

  -- payment_methods memang GLOBAL (tidak punya kolom event_id).
  select * into method_row from public.payment_methods where code = p_payment_method;
  if not found then raise exception using errcode = '22023', message = 'PAYMENT_METHOD_NOT_FOUND'; end if;
  if not method_row.is_active then raise exception using errcode = '22023', message = 'PAYMENT_METHOD_INACTIVE'; end if;

  if method_row.requires_reference then
    if p_approval_code is null or p_approval_code !~ ('^[0-9]{' || method_row.reference_digits || '}$') then
      raise exception using errcode = '22023', message = 'INVALID_APPROVAL_CODE';
    end if;
  end if;

  for order_row in
    select * from public.orders
    where id = any(p_order_ids) and event_id = p_event_id
    order by id for update
  loop
    if order_row.status <> 'pending' then raise exception using errcode = 'P0005', message = 'ORDER_NOT_PENDING'; end if;
    next_status := case when order_row.pickup_mode = 'immediate' then 'handed_over'::public.order_status else 'paid'::public.order_status end;
    update public.orders set
      status = next_status,
      payment_method = p_payment_method,
      approval_code = case when method_row.requires_reference then p_approval_code else null end,
      paid_at = now(),
      paid_by = p_paid_by,
      handed_over_at = case when next_status = 'handed_over' then now() else null end,
      handed_over_by = case when next_status = 'handed_over' then p_paid_by else null end
    where id = order_row.id returning * into order_row;
    insert into public.audit_logs (event_id, order_id, user_id, action, payload)
      values (p_event_id, order_row.id, p_paid_by, 'pay', jsonb_build_object('payment_method', p_payment_method, 'status', next_status));
    if next_status = 'handed_over' then
      insert into public.audit_logs (event_id, order_id, user_id, action, payload)
        values (p_event_id, order_row.id, p_paid_by, 'hand_over', jsonb_build_object('mode', 'immediate'));
    end if;
    return next order_row;
  end loop;
end;
$function$;

-- ---------------------------------------------------------------------------
-- void_order_transaction
-- ---------------------------------------------------------------------------
drop function if exists public.void_order_transaction(uuid, text, uuid, boolean, integer);

create function public.void_order_transaction(
  p_event_id uuid,
  p_order_id uuid,
  p_reason text,
  p_user_id uuid,
  p_is_admin boolean default false,
  p_booth_id integer default null
)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  result_order public.orders;
  old_order public.orders;
  claim record;
begin
  if p_event_id is null then raise exception using errcode = '22023', message = 'EVENT_REQUIRED'; end if;
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'VOID_REASON_REQUIRED';
  end if;

  -- Filter event digabung ke pencarian, bukan diperiksa sesudahnya: order event
  -- lain otomatis jadi "tidak ditemukan".
  select * into old_order from public.orders
  where id = p_order_id and event_id = p_event_id for update;
  if not found then
    raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE';
  end if;

  if p_booth_id is not null then
    if old_order.booth_id <> p_booth_id then raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE'; end if;
    if not old_order.auto_settled then raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE'; end if;
    if old_order.status = 'void' then raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE'; end if;
  elsif old_order.status in ('pending', 'paid') then
    null;
  elsif old_order.status = 'handed_over' and p_is_admin then
    null;
  else
    raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE';
  end if;

  update public.orders
  set status = 'void', void_reason = trim(p_reason), voided_at = now(), voided_by = p_user_id
  where id = p_order_id and event_id = p_event_id
  returning * into result_order;

  for claim in
    select i.offer_id, so.is_builtin, so.booth_id, so.stock
    from public.order_special_items i
    join public.special_offers so on so.id = i.offer_id
    where i.order_id = p_order_id
  loop
    if claim.stock is not null then
      update public.special_offers set stock = stock + 1 where id = claim.offer_id and event_id = p_event_id;
      if claim.is_builtin then
        update public.booths set discount_item_stock = discount_item_stock + 1
        where id = claim.booth_id and event_id = p_event_id and discount_item_stock is not null;
      end if;
    end if;
  end loop;

  insert into public.audit_logs (event_id, order_id, user_id, action, payload)
  values (p_event_id, p_order_id, p_user_id, 'void', jsonb_build_object(
    'reason', trim(p_reason), 'previous_status', old_order.status,
    'by_admin', p_is_admin, 'by_booth', p_booth_id));

  return result_order;
end;
$function$;

-- ---------------------------------------------------------------------------
-- hand_over_order_transaction
-- ---------------------------------------------------------------------------
drop function if exists public.hand_over_order_transaction(uuid, uuid);

create function public.hand_over_order_transaction(
  p_event_id uuid,
  p_order_id uuid,
  p_user_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare result_order public.orders;
begin
  if p_event_id is null then raise exception using errcode = '22023', message = 'EVENT_REQUIRED'; end if;
  update public.orders
  set status = 'handed_over', handed_over_at = now(), handed_over_by = p_user_id
  where id = p_order_id and event_id = p_event_id and status = 'paid' and pickup_mode = 'after_payment'
  returning * into result_order;
  if not found then raise exception using errcode = 'P0006', message = 'ORDER_NOT_ELIGIBLE_FOR_HANDOVER'; end if;
  insert into public.audit_logs (event_id, order_id, user_id, action, payload)
  values (p_event_id, p_order_id, p_user_id, 'hand_over', '{}'::jsonb);
  return result_order;
end;
$function$;

-- ---------------------------------------------------------------------------
-- admin_upsert_booth DIBUANG
-- ---------------------------------------------------------------------------
-- /api/admin/booths sudah memakai insert/update langsung yang discope event
-- (diverifikasi: tidak ada `rpc("admin_upsert_booth")` di src/). Fungsi ini
-- menghitung `max(id) + 1` lintas event dan meng-UPDATE `where id = p_id` tanpa
-- event, jadi ia satu-satunya jalur tulis booth yang bisa menimpa milik event
-- lain. Dibiarkan ada = pintu yang menunggu dipakai lagi.
drop function if exists public.admin_upsert_booth(integer, text, text, text, integer, boolean, boolean, integer, boolean);

-- ---------------------------------------------------------------------------
-- Hak akses: signature berubah, jadi grant lama ikut hilang bersama fungsinya.
-- ---------------------------------------------------------------------------
revoke all on function public.create_order_transaction(uuid, text, uuid, integer, boolean, integer, text, uuid, text[]) from public;
revoke all on function public.settle_orders_transaction(uuid, uuid[], text, text, uuid) from public;
revoke all on function public.void_order_transaction(uuid, uuid, text, uuid, boolean, integer) from public;
revoke all on function public.hand_over_order_transaction(uuid, uuid, uuid) from public;

grant execute on function public.create_order_transaction(uuid, text, uuid, integer, boolean, integer, text, uuid, text[]) to service_role;
grant execute on function public.settle_orders_transaction(uuid, uuid[], text, text, uuid) to service_role;
grant execute on function public.void_order_transaction(uuid, uuid, text, uuid, boolean, integer) to service_role;
grant execute on function public.hand_over_order_transaction(uuid, uuid, uuid) to service_role;
