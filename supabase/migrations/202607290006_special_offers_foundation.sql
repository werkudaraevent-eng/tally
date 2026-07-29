-- Tahap 1 dari 4: model penawaran spesial yang generik.
--
-- Latar belakang. Klien meminta item "tebus murah": harga tertentu, hanya bisa
-- dibeli peserta dengan akumulasi transaksi >= Rp 500.000 di semua booth, maksimal
-- 1x per peserta, dan nilainya IKUT masuk hitungan top spender.
--
-- Kenapa tidak cukup menambah kolom boolean baru di orders:
-- 1. `orders.has_discount_item` cuma satu boolean, jadi hanya bisa menyatakan satu
--    jenis item spesial. Menambah jenis kedua berarti boolean ketiga, keempat, dst.
-- 2. CHECK `total_matches_items` memaku harga item spesial ke Rp 1:
--       total_amount = regular_amount + (has_discount_item ? 1 : 0)
--    Kolom `booths.discount_item_price` sudah ada tapi DIABAIKAN constraint ini.
--    Itu bug laten yang belum terlihat karena semua booth masih Rp 1.
-- 3. Leaderboard memakai sum(regular_amount), jadi harga item spesial memang tidak
--    pernah ikut dihitung.
--
-- Tahap ini MURNI ADITIF: dua tabel baru + backfill. Tidak ada perilaku yang
-- berubah, tidak ada constraint yang disentuh, tidak ada RPC yang diubah.
-- Pembongkaran CHECK constraint dilakukan di tahap 2 secara terpisah supaya bisa
-- diverifikasi sendiri.

create table if not exists public.special_offers (
  id           bigserial primary key,
  code         text not null unique,
  name         text not null,
  -- Harga bebas, tidak lagi dipaku Rp 1. Diberlakukan mulai tahap 2.
  price        int not null default 1 check (price >= 0),
  -- null = tak terbatas, konsisten dengan booths.discount_item_stock.
  stock        int check (stock is null or stock >= 0),
  -- 'per_booth' = tiap booth punya kuotanya sendiri (perilaku diskon lama).
  -- 'global'    = satu kuota untuk seluruh acara, bisa ditebus di booth mana saja.
  scope        text not null default 'per_booth' check (scope in ('per_booth', 'global')),
  -- Wajib diisi bila scope = 'per_booth'; harus null bila 'global'.
  booth_id     int references public.booths(id) on delete cascade,
  max_per_participant int not null default 1 check (max_per_participant >= 0),
  -- Syarat akumulasi transaksi peserta di SEMUA booth. null = tanpa syarat.
  -- Dihitung dari order berstatus paid/handed_over saja.
  min_accumulated_amount int check (min_accumulated_amount is null or min_accumulated_amount >= 0),
  -- Penentu apakah harga item ini menambah angka top spender. Diskon Rp 1 lama
  -- diisi false agar angka historis leaderboard tidak bergeser sedikit pun.
  counts_toward_leaderboard boolean not null default false,
  is_active    boolean not null default true,
  sort_order   int not null default 100,
  -- Penawaran turunan config booth lama; dikelola lewat halaman Booth, bukan
  -- dihapus dari halaman penawaran.
  is_builtin   boolean not null default false,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.users(id),
  constraint special_offers_code_format check (code ~ '^[a-z0-9_]{2,40}$'),
  -- Mencegah kombinasi yang tidak punya arti: global tapi terikat booth, atau
  -- per_booth tapi tidak tahu booth mana.
  constraint special_offers_scope_booth check (
    (scope = 'per_booth' and booth_id is not null) or
    (scope = 'global' and booth_id is null)
  )
);

alter table public.special_offers enable row level security;

-- Satu penawaran builtin per booth. Partial unique index, bukan constraint biasa,
-- karena hanya berlaku untuk baris builtin.
create unique index if not exists special_offers_builtin_booth_idx
  on public.special_offers (booth_id)
  where is_builtin;

create index if not exists special_offers_active_idx
  on public.special_offers (sort_order)
  where is_active;

-- Satu baris per item spesial yang diklaim. Menggantikan boolean tunggal, sehingga
-- satu order bisa membawa beberapa item spesial sekaligus.
create table if not exists public.order_special_items (
  id         bigserial primary key,
  order_id   uuid not null references public.orders(id) on delete cascade,
  offer_id   bigint not null references public.special_offers(id) on delete restrict,
  -- Snapshot harga saat diklaim, pola sama dengan orders.pickup_mode (BR-12).
  -- Mengubah harga penawaran tidak boleh mengubah nilai order yang sudah terjadi.
  price_at_claim int not null check (price_at_claim >= 0),
  -- Snapshot juga: toggle "masuk top spender" di halaman admin TIDAK retroaktif.
  -- Leaderboard tampil di proyektor di depan peserta; angka yang berubah mendadak
  -- tanpa transaksi baru tidak bisa dijelaskan panitia di tempat.
  counts_toward_leaderboard boolean not null default false,
  created_at timestamptz not null default now(),
  -- Satu order tidak boleh mengklaim penawaran yang sama dua kali.
  constraint order_special_items_unique unique (order_id, offer_id)
);

alter table public.order_special_items enable row level security;

create index if not exists order_special_items_offer_idx
  on public.order_special_items (offer_id);

-- Backfill 1: config diskon tiap booth menjadi baris special_offers.
-- counts_toward_leaderboard = false menjaga angka leaderboard yang sudah tampil.
insert into public.special_offers (
  code, name, price, stock, scope, booth_id, max_per_participant,
  min_accumulated_amount, counts_toward_leaderboard, is_active, sort_order, is_builtin
)
select
  'booth_' || b.id || '_diskon',
  b.discount_item_name,
  b.discount_item_price,
  b.discount_item_stock,
  'per_booth',
  b.id,
  b.discount_limit_per_participant,
  null,
  false,
  b.discount_enabled,
  b.id,
  true
from public.booths b
on conflict (code) do nothing;

-- Backfill 2: klaim yang sudah ada. Termasuk order void supaya riwayat tetap utuh;
-- status order tetap satu-satunya penentu apakah klaim itu dihitung.
insert into public.order_special_items (order_id, offer_id, price_at_claim, counts_toward_leaderboard, created_at)
select o.id, so.id, 1, false, o.created_at
from public.orders o
join public.special_offers so on so.booth_id = o.booth_id and so.is_builtin
where o.has_discount_item
on conflict (order_id, offer_id) do nothing;

comment on table public.special_offers is
  'Aturan item spesial (diskon per booth, tebus murah, dst). Dikelola admin tanpa migrasi.';
comment on table public.order_special_items is
  'Klaim item spesial per order. Harga & flag leaderboard di-snapshot saat klaim.';
