-- Metode pembayaran dapat dikelola dari admin workspace.
--
-- Sebelumnya payment_method adalah enum Postgres ('edc','cash'). Enum tidak bisa
-- dikelola dari UI: menambah nilai butuh ALTER TYPE (migrasi), dan menghapus
-- nilai praktis tidak mungkin. Karena itu enum diganti tabel lookup.
--
-- Yang dijaga:
-- - Data order lama tetap utuh. Kolom dikonversi ke text lalu diikat FK ke
--   payment_methods(code), jadi nilai 'edc'/'cash' yang sudah ada tetap valid.
-- - Minimal satu metode harus aktif. Dijaga trigger di database, bukan hanya di
--   API, supaya tidak bisa dilanggar lewat SQL langsung. Kalau semua metode mati,
--   kasir tidak bisa menyelesaikan pembayaran sama sekali.
-- - Metode yang sudah dipakai order tidak boleh dihapus, hanya dinonaktifkan,
--   supaya laporan pasca-acara tidak kehilangan referensi.

create table if not exists public.payment_methods (
  code text primary key,
  label text not null,
  -- EDC butuh approval code 6 digit. Metode lain (QRIS, transfer) bisa punya
  -- nomor referensi dengan panjang berbeda, atau tanpa referensi sama sekali.
  requires_reference boolean not null default false,
  reference_label text,
  reference_digits int check (reference_digits is null or reference_digits between 4 and 32),
  is_active boolean not null default true,
  sort_order int not null default 100,
  -- Builtin tidak boleh dihapus karena dirujuk logika lama & data historis.
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  constraint payment_methods_code_format check (code ~ '^[a-z0-9_]{2,32}$'),
  constraint payment_methods_reference_digits_needed check (
    not requires_reference or reference_digits is not null
  )
);

alter table public.payment_methods enable row level security;

insert into public.payment_methods (code, label, requires_reference, reference_label, reference_digits, sort_order, is_builtin)
values
  ('edc', 'EDC / Kartu', true, 'Approval code EDC', 6, 10, true),
  ('cash', 'Tunai', false, null, null, 20, true)
on conflict (code) do nothing;

-- Konversi kolom enum -> text. USING ::text menjaga nilai lama apa adanya.
alter table public.orders
  alter column payment_method type text using payment_method::text;

alter table public.orders
  add constraint orders_payment_method_fkey
  foreign key (payment_method) references public.payment_methods(code)
  on update cascade on delete restrict;

-- Signature RPC berubah (payment_method -> text), jadi harus di-drop dulu.
drop function if exists public.settle_orders_transaction(uuid[], payment_method, text, uuid);
drop type if exists payment_method;

create or replace function public.settle_orders_transaction(p_order_ids uuid[], p_payment_method text, p_approval_code text, p_paid_by uuid)
returns setof public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  order_row public.orders;
  next_status public.order_status;
  method_row public.payment_methods;
begin
  if coalesce(array_length(p_order_ids, 1), 0) = 0 then raise exception using errcode = '22023', message = 'NO_ORDERS_SELECTED'; end if;

  select * into method_row from public.payment_methods where code = p_payment_method;
  if not found then raise exception using errcode = '22023', message = 'PAYMENT_METHOD_NOT_FOUND'; end if;
  -- Metode yang dimatikan admin di tengah acara tidak boleh dipakai lagi.
  if not method_row.is_active then raise exception using errcode = '22023', message = 'PAYMENT_METHOD_INACTIVE'; end if;

  -- Validasi referensi kini digerakkan data, bukan hardcode 'edc'.
  if method_row.requires_reference then
    if p_approval_code is null or p_approval_code !~ ('^[0-9]{' || method_row.reference_digits || '}$') then
      raise exception using errcode = '22023', message = 'INVALID_APPROVAL_CODE';
    end if;
  end if;

  for order_row in select * from public.orders where id = any(p_order_ids) order by id for update loop
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
    insert into public.audit_logs (order_id, user_id, action, payload)
      values (order_row.id, p_paid_by, 'pay', jsonb_build_object('payment_method', p_payment_method, 'status', next_status));
    if next_status = 'handed_over' then
      insert into public.audit_logs (order_id, user_id, action, payload)
        values (order_row.id, p_paid_by, 'hand_over', jsonb_build_object('mode', 'immediate'));
    end if;
    return next order_row;
  end loop;
end;
$function$;

-- Jaring pengaman terakhir: minimal satu metode aktif, ditegakkan di database.
create or replace function public.enforce_active_payment_method()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if (select count(*) from public.payment_methods where is_active) = 0 then
    raise exception using errcode = '22023', message = 'AT_LEAST_ONE_PAYMENT_METHOD_REQUIRED';
  end if;
  return null;
end;
$function$;

drop trigger if exists payment_methods_require_active on public.payment_methods;
create constraint trigger payment_methods_require_active
  after update or delete on public.payment_methods
  deferrable initially deferred
  for each row execute function public.enforce_active_payment_method();

revoke all on function public.settle_orders_transaction(uuid[], text, text, uuid) from anon;
revoke all on function public.enforce_active_payment_method() from anon;
