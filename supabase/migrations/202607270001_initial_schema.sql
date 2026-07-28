-- PRIMA Executive Gathering 2026
-- Initial PostgreSQL schema. Apply through Supabase migrations.

create extension if not exists pgcrypto;

create type order_status as enum ('pending', 'paid', 'void', 'handed_over');
create type payment_method as enum ('edc', 'cash');
create type pickup_mode as enum ('after_payment', 'immediate');
create type user_role as enum ('booth', 'cashier', 'admin');
create type name_display_mode as enum ('full', 'initials', 'company_only', 'hidden');

create table booths (
  id int primary key,
  name text not null,
  code text unique not null,
  discount_item_name text not null,
  discount_item_price int not null default 1 check (discount_item_price = 1),
  discount_item_stock int check (discount_item_stock is null or discount_item_stock >= 0),
  is_active boolean not null default true
);

create table participants (
  id uuid primary key default gen_random_uuid(),
  qr_code text unique not null,
  name text not null,
  company text,
  title text,
  photo_url text,
  allow_name_display boolean not null default true,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  pin_hash text not null,
  role user_role not null,
  booth_id int references booths(id),
  is_active boolean not null default true,
  constraint booth_user_requires_booth check (role <> 'booth' or booth_id is not null)
);

create table event_settings (
  id int primary key default 1 check (id = 1),
  pickup_mode pickup_mode not null default 'after_payment',
  name_display_mode name_display_mode not null default 'full',
  leaderboard_enabled boolean not null default true,
  pending_auto_void_minutes int not null default 45 check (pending_auto_void_minutes > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  participant_id uuid not null references participants(id),
  booth_id int not null references booths(id),
  has_discount_item boolean not null default false,
  regular_amount int not null default 0 check (regular_amount >= 0),
  total_amount int not null check (total_amount >= 0),
  status order_status not null default 'pending',
  pickup_mode pickup_mode not null,
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  payment_method payment_method,
  approval_code text,
  paid_at timestamptz,
  paid_by uuid references users(id),
  handed_over_at timestamptz,
  handed_over_by uuid references users(id),
  void_reason text,
  voided_at timestamptz,
  voided_by uuid references users(id),
  constraint total_matches_items check (
    total_amount = regular_amount + case when has_discount_item then 1 else 0 end
  )
);

create unique index uniq_discount_per_booth
  on orders (participant_id, booth_id)
  where has_discount_item = true and status <> 'void';

create index idx_orders_participant on orders (participant_id);
create index idx_orders_status on orders (status);
create index idx_orders_booth on orders (booth_id);
create index idx_orders_created_at on orders (created_at desc);

create table audit_logs (
  id bigserial primary key,
  order_id uuid references orders(id),
  user_id uuid references users(id),
  action text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

insert into event_settings (id) values (1);

insert into booths (id, code, name, discount_item_name, discount_item_price)
values
  (1, 'B1', 'Booth 1', '[isi nama item]', 1),
  (2, 'B2', 'Booth 2', '[isi nama item]', 1),
  (3, 'B3', 'Booth 3', '[isi nama item]', 1),
  (4, 'B4', 'Booth 4', '[isi nama item]', 1),
  (5, 'B5', 'Booth 5', '[isi nama item]', 1),
  (6, 'B6', 'Booth 6', '[isi nama item]', 1);

alter table users enable row level security;
alter table participants enable row level security;
alter table booths enable row level security;
alter table orders enable row level security;
alter table event_settings enable row level security;
alter table audit_logs enable row level security;

-- Server-side service role and route handlers own all mutations.
-- Route handlers use service role after application session and role checks.

create or replace function public.auto_void_expired_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update orders
  set status = 'void',
      void_reason = 'Auto-void: melewati batas waktu pembayaran',
      voided_at = now()
  where status = 'pending'
    and created_at <= now() - make_interval(mins => (select pending_auto_void_minutes from event_settings where id = 1));
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.auto_void_expired_orders() from public;
grant execute on function public.auto_void_expired_orders() to service_role;
