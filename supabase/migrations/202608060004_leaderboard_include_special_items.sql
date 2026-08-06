-- Item spesial yang bernilai tidak ikut terhitung di top spender.
--
-- =========================================================================
-- BUG, BUKAN SALAH TAFSIR
-- =========================================================================
-- Klien membandingkan pivot Excel dengan papan di web dan menemukan Kain Endek
-- tidak terhitung. Pivot yang BENAR.
--
-- Penyebab: `get_leaderboard` menjumlahkan HANYA `orders.regular_amount`. Nilai
-- item spesial disimpan di tabel terpisah `order_special_items` dan tidak pernah
-- ikut dijumlahkan — padahal setiap barisnya membawa kolom
-- `counts_toward_leaderboard` yang justru diadakan untuk keputusan ini, dan
-- SPEC BR-05 memang menyatakan flag itulah penentunya.
--
-- Jadi kolomnya ada, aturannya tertulis, tetapi tidak ada satu pun kueri yang
-- membacanya. Kegagalan seperti ini tidak memunculkan galat: papan tetap tampil
-- rapi dengan angka yang lebih kecil, dan hanya ketahuan kalau ada yang
-- menghitung ulang dari sisi lain.
--
-- Dampak terukur sebelum perbaikan:
--   31 klaim bertanda ikut hitung, nilai hilang Rp 4.935.265, 25 peserta.
--   Lima item terdampak: Kain Endek (B6) Rp 550.006 x4, Minyak Kayu Putih (B1)
--   Rp 206.501 x9, Kebaya Bordir (B5) Rp 330.005 x2, Kaos Lukis (B7)
--   Rp 215.507 x1, Tebus Murah (DSP) Rp 81 x15.
--
-- Peringkat ikut berubah, dan itu bagian terpentingnya: Suryono Hidayat
-- (Rp 3.350.000) sama sekali TIDAK MUNCUL di 10 besar sebelum perbaikan,
-- padahal seharusnya peringkat 4. Haryadi naik ke peringkat 3.
--
-- =========================================================================
-- KENAPA MEMBACA order_special_items.counts_toward_leaderboard,
-- BUKAN special_offers.counts_toward_leaderboard
-- =========================================================================
-- Nilai di `order_special_items` adalah SNAPSHOT saat klaim (lihat BR-05 dan
-- migrasi 202607290007). Membaca konfigurasi `special_offers` yang berlaku saat
-- ini membuat toggle di CMS bersifat retroaktif: satu klik admin akan menggeser
-- angka yang sedang tampil di proyektor tanpa ada transaksi baru, dan panitia
-- tidak punya penjelasan apa pun untuk itu di depan peserta.
--
-- `price_at_claim` dipakai untuk alasan yang sama — bukan `special_offers.price`.
--
-- =========================================================================
-- KENAPA SUBKUERI TERAGREGASI, BUKAN JOIN LANGSUNG
-- =========================================================================
-- `join order_special_items` di dalam CTE `totals` akan MELIPATGANDAKAN baris
-- order: satu order dengan dua item spesial ikut menggandakan
-- `sum(regular_amount)` menjadi dua kali. Kesalahan itu justru MEMBESARKAN angka,
-- sehingga terlihat seperti perbaikan yang berhasil dan tidak akan dicurigai.
--
-- Bentuk yang dipakai: hitung nilai spesial per ORDER lebih dulu di CTE
-- tersendiri, lalu jumlahkan sekali per peserta. Dengan begitu jumlah baris
-- order tidak pernah berubah.
--
-- `booth_count` sengaja TETAP dihitung dari `count(distinct o.booth_id)` dan
-- tidak disentuh: seseorang mengunjungi sebuah booth atau tidak, dan itu tidak
-- bergantung pada apakah ia menebus item spesial di sana.
create or replace function public.get_leaderboard(p_limit integer default 10)
returns table(rank bigint, display_name text, company text, total_spent bigint, booth_count bigint)
language sql
security definer
set search_path to 'public'
as $function$
  with special as (
    -- Nilai item spesial PER ORDER. Diagregasi di sini supaya penggabungan di
    -- bawah tetap satu baris per order dan tidak menggandakan regular_amount.
    --
    -- `counts_toward_leaderboard` dibaca dari baris klaim, bukan dari
    -- special_offers, supaya mengubah toggle di CMS tidak bersifat retroaktif.
    select i.order_id, sum(i.price_at_claim)::bigint as amount
    from public.order_special_items i
    where i.counts_toward_leaderboard
    group by i.order_id
  ), totals as (
    select p.id, p.name, p.company, p.allow_name_display,
           sum(o.regular_amount + coalesce(s.amount, 0))::bigint as total_spent,
           count(distinct o.booth_id)::bigint as booth_count,
           row_number() over(
             order by sum(o.regular_amount + coalesce(s.amount, 0)) desc,
                      count(distinct o.booth_id) desc,
                      p.name
           ) as rank
    from public.participants p
    join public.orders o on o.participant_id = p.id
    -- LEFT JOIN: mayoritas order tidak punya item spesial, dan order tanpa item
    -- tidak boleh hilang dari papan.
    left join special s on s.order_id = o.id
    where o.status in ('paid', 'handed_over')
      and not public.leaderboard_is_excluded(p.id, p.company)
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

comment on function public.get_leaderboard(integer) is
  'Papan top spender. Menjumlahkan orders.regular_amount DITAMBAH order_special_items.price_at_claim untuk klaim yang counts_toward_leaderboard = true (BR-05). Flag dan harga dibaca dari baris KLAIM, bukan dari special_offers, supaya perubahan konfigurasi tidak retroaktif terhadap angka yang sudah tampil di proyektor.';
