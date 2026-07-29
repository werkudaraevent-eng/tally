-- Mode tanpa konfirmasi kasir.
--
-- Permintaan klien: admin booth membuat order, nilainya langsung terekap dan
-- masuk hitungan top spender, tanpa kasir menandai lunas.
--
-- Kenapa status diubah saat order DIBUAT, bukan leaderboard yang disuruh
-- menghitung 'pending':
-- - 'pending' berarti "belum dibayar" dan dipakai auto_void_expired_orders,
--   antrean kasir, serta progress booth. Kalau leaderboard ikut menghitung
--   'pending', order akan tetap kena auto-void setelah 45 menit sehingga angka
--   top spender naik lalu turun sendiri tanpa sebab yang terlihat.
-- - Dengan menetapkan status akhir saat pembuatan, arti tiap status tidak
--   bergeser dan leaderboard/laporan/auto-void tidak perlu diubah sama sekali.

alter table public.event_settings
  add column if not exists cashier_confirmation_required boolean not null default true;

comment on column public.event_settings.cashier_confirmation_required is
  'true = order booth masuk antrean kasir (alur asli). false = order langsung lunas saat dibuat.';

-- Snapshot per order, pola sama dengan pickup_mode (BR-12): kalau toggle diubah
-- di tengah acara, order lama tetap mengikuti aturan saat dibuat.
alter table public.orders
  add column if not exists auto_settled boolean not null default false;

comment on column public.orders.auto_settled is
  'true = order dilunasi otomatis tanpa kasir. Dipakai untuk menentukan siapa yang boleh void.';

create or replace function public.create_order_transaction(p_code text, p_participant_id uuid, p_booth_id integer, p_has_discount_item boolean, p_regular_amount integer, p_note text, p_created_by uuid)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  booth_row public.booths;
  settings_row public.event_settings;
  new_order public.orders;
  discount_price int := 0;
  existing_here int;
  initial_status public.order_status := 'pending';
  auto_settle boolean := false;
begin
  if p_regular_amount < 0 then raise exception using errcode = '22023', message = 'INVALID_AMOUNT'; end if;
  if p_code !~ '^B[1-9][0-9]*-[0-9]{3}$' then raise exception using errcode = '22023', message = 'INVALID_ORDER_CODE'; end if;
  if exists (select 1 from public.orders where code = upper(trim(p_code))) then raise exception using errcode = 'P0005', message = 'ORDER_CODE_USED'; end if;

  select * into booth_row from public.booths where id = p_booth_id and is_active = true for update;
  if not found then raise exception using errcode = 'P0003', message = 'BOOTH_NOT_FOUND'; end if;
  select * into settings_row from public.event_settings where id = 1;

  if p_has_discount_item then
    if not booth_row.discount_enabled or booth_row.discount_limit_per_participant <= 0 then
      raise exception using errcode = 'P0006', message = 'DISCOUNT_NOT_OFFERED';
    end if;
    select count(*) into existing_here from public.orders
      where participant_id = p_participant_id and booth_id = p_booth_id and has_discount_item = true and status <> 'void';
    if existing_here >= booth_row.discount_limit_per_participant then
      raise exception using errcode = 'P0006', message = 'DISCOUNT_ALREADY_TAKEN';
    end if;
    if booth_row.discount_item_stock is not null then
      if booth_row.discount_item_stock <= 0 then raise exception using errcode = 'P0004', message = 'DISCOUNT_OUT_OF_STOCK'; end if;
      update public.booths set discount_item_stock = discount_item_stock - 1 where id = p_booth_id;
    end if;
    discount_price := 1;
  end if;

  -- Tanpa kasir: order langsung final. 'handed_over' bila barang diserahkan di
  -- booth, 'paid' bila peserta masih harus mengambil barang nanti.
  if not settings_row.cashier_confirmation_required then
    auto_settle := true;
    initial_status := case when settings_row.pickup_mode = 'immediate' then 'handed_over'::public.order_status else 'paid'::public.order_status end;
  end if;

  insert into public.orders (
    code, participant_id, booth_id, has_discount_item, regular_amount, total_amount,
    status, pickup_mode, note, created_by, auto_settled,
    -- payment_method sengaja NULL: tidak ada kasir yang memilih metode, dan
    -- mengisi nilai palsu ('cash') akan mengotori rekonsiliasi pasca-acara.
    payment_method, paid_at, paid_by, handed_over_at, handed_over_by
  )
  values (
    upper(trim(p_code)), p_participant_id, p_booth_id, p_has_discount_item, p_regular_amount, p_regular_amount + discount_price,
    initial_status, settings_row.pickup_mode, nullif(trim(p_note), ''), p_created_by, auto_settle,
    null,
    case when auto_settle then now() else null end,
    case when auto_settle then p_created_by else null end,
    case when auto_settle and initial_status = 'handed_over' then now() else null end,
    case when auto_settle and initial_status = 'handed_over' then p_created_by else null end
  )
  returning * into new_order;

  insert into public.audit_logs (order_id, user_id, action, payload)
  values (new_order.id, p_created_by, 'create', jsonb_build_object('code', new_order.code, 'pickup_mode', new_order.pickup_mode, 'has_discount_item', new_order.has_discount_item, 'auto_settled', auto_settle, 'status', initial_status));

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

-- Booth boleh membatalkan order buatannya sendiri saat mode tanpa kasir.
--
-- Konflik yang ditangani di sini: dengan pickup_mode = 'immediate', order
-- auto-settle langsung berstatus 'handed_over'. BR-08 melarang void status itu
-- kecuali admin — artinya tanpa pengecualian ini booth TIDAK PUNYA jalan koreksi
-- sama sekali untuk salah input. Karena itu booth diizinkan, tapi dibatasi:
-- hanya order milik booth-nya sendiri DAN hanya yang auto_settled.
-- Order alur kasir tetap mengikuti BR-08 seperti semula.
--
-- Fungsi lama HARUS di-drop: menambah parameter menghasilkan fungsi baru dengan
-- signature berbeda, bukan mengganti. Kalau keduanya ada, panggilan 4-argumen
-- menjadi ambigu dan Postgres menolak dengan "function is not unique".
drop function if exists public.void_order_transaction(uuid, text, uuid, boolean);

create or replace function public.void_order_transaction(p_order_id uuid, p_reason text, p_user_id uuid, p_is_admin boolean default false, p_booth_id integer default null)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  result_order public.orders;
  old_order public.orders;
begin
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'VOID_REASON_REQUIRED';
  end if;

  select * into old_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE';
  end if;

  if p_booth_id is not null then
    -- Pemanggil adalah operator booth.
    if old_order.booth_id <> p_booth_id then
      raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE';
    end if;
    if not old_order.auto_settled then
      raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE';
    end if;
    if old_order.status = 'void' then
      raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE';
    end if;
  elsif old_order.status in ('pending', 'paid') then
    null;
  elsif old_order.status = 'handed_over' and p_is_admin then
    null;
  else
    raise exception using errcode = 'P0007', message = 'ORDER_NOT_VOIDABLE';
  end if;

  update public.orders
  set status = 'void',
      void_reason = trim(p_reason),
      voided_at = now(),
      voided_by = p_user_id
  where id = p_order_id
  returning * into result_order;

  if old_order.has_discount_item then
    update public.booths
    set discount_item_stock = discount_item_stock + 1
    where id = old_order.booth_id and discount_item_stock is not null;
  end if;

  insert into public.audit_logs (order_id, user_id, action, payload)
  values (p_order_id, p_user_id, 'void', jsonb_build_object(
    'reason', trim(p_reason),
    'previous_status', old_order.status,
    'by_admin', p_is_admin,
    'by_booth', p_booth_id
  ));

  return result_order;
end;
$function$;

-- Saat admin mematikan konfirmasi kasir, order yang masih menggantung di antrean
-- kasir dilunasi sekaligus. Tanpa ini order tersebut tidak ada yang melayani dan
-- akan kena auto-void setelah 45 menit.
create or replace function public.settle_pending_orders_without_cashier(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  settled_count int := 0;
  item public.orders;
begin
  for item in
    select * from public.orders where status = 'pending' order by created_at for update
  loop
    update public.orders
    set status = case when item.pickup_mode = 'immediate' then 'handed_over'::public.order_status else 'paid'::public.order_status end,
        auto_settled = true,
        paid_at = now(),
        paid_by = p_user_id,
        handed_over_at = case when item.pickup_mode = 'immediate' then now() else null end,
        handed_over_by = case when item.pickup_mode = 'immediate' then p_user_id else null end
    where id = item.id;

    insert into public.audit_logs (order_id, user_id, action, payload)
    values (item.id, p_user_id, 'pay', jsonb_build_object('automatic', true, 'reason', 'cashier_confirmation_disabled', 'payment_method', null));

    settled_count := settled_count + 1;
  end loop;

  return jsonb_build_object('settled', settled_count);
end;
$function$;

revoke all on function public.create_order_transaction(text, uuid, integer, boolean, integer, text, uuid) from anon;
revoke all on function public.void_order_transaction(uuid, text, uuid, boolean, integer) from anon;
revoke all on function public.settle_pending_orders_without_cashier(uuid) from anon;
