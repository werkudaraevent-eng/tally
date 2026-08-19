-- ============================================================================
-- Hapus event permanen (P6).
--
-- SATU RPC, bukan rangkaian panggilan dari route handler. Alasannya bukan gaya:
-- klien Supabase mengirim tiap `.delete()` sebagai permintaan HTTP terpisah,
-- masing-masing dengan transaksinya sendiri. Gagal di tabel ke-12 berarti 11
-- tabel sudah kosong sementara event-nya masih ada -- keadaan yang tidak
-- diwakili status mana pun dan tidak punya jalan pulih dari dalam aplikasi.
-- Di dalam fungsi ini, semuanya satu transaksi: gagal di mana pun, tidak ada
-- satu baris pun yang hilang.
--
-- URUTAN penghapusan mengikuti FK, bukan abjad. Yang menentukan ada tiga:
--
--   1. `audit_logs.order_id -> orders(id)` TANPA on delete, jadi NO ACTION.
--      Log harus dihapus SEBELUM order, kalau tidak seluruh transaksi ditolak
--      23503 di langkah berikutnya.
--   2. `seat_map_sessions.seat_map_id -> seat_maps(id)` juga NO ACTION,
--      sementara `seat_maps` ikut CASCADE saat baris event dihapus di langkah
--      terakhir. Sesi harus lebih dulu dibuang secara eksplisit.
--   3. Ketujuh tabel setelan (event_settings, display_settings, seat_maps,
--      rundown_settings, leaderboard_reveal, undian_settings, undian_state)
--      memakai `on delete cascade` ke events, jadi sengaja TIDAK disebut di
--      sini: menghapusnya lebih dulu hanya mengulang pekerjaan yang sudah
--      dijamin database.
--   4. EMPAT FK di skema ini bersifat KOMPOSIT dengan `on delete set null`, dan
--      `event_id` ikut dipetakan di dalamnya:
--
--        undian_prizes     (event_id, entry_group_id) -> undian_entry_groups
--        user_event_access (event_id, booth_id)       -> booths
--        undian_winners    (event_id, session_id)     -> undian_sessions
--        undian_winners    (event_id, participant_id) -> participants
--
--      `set null` mengosongkan SELURUH kolom pemetaan, bukan hanya kolom
--      penunjuknya -- termasuk `event_id` yang `not null`. Menghapus induk lebih
--      dulu karena itu bukan sekadar tidak rapi: Postgres menolaknya dengan
--      23502 dan seluruh transaksi batal. Keempat anak wajib dihapus SEBELUM
--      induknya, dan itulah yang menentukan urutan blok undian di bawah serta
--      alasan `user_event_access` disebut eksplisit meski sudah punya CASCADE:
--      CASCADE-nya baru jalan di langkah terakhir, jauh sesudah booth hilang.
--
-- PENJAGA, dan kenapa hanya tiga:
--   - status wajib `draft` atau `archived`. Event `active` sedang dipakai
--     layar publik; event `completed` laporannya sudah diserahkan ke klien.
--   - nol order. Order adalah satu-satunya data di sini yang mewakili UANG;
--     sisanya (booth, hadiah, rundown) dapat dibuat ulang. Event yang pernah
--     bertransaksi harus diarsipkan, tidak dihapus.
--   - peserta TIDAK diperiksa. Justru peserta uji itulah yang harus ikut
--     terbuang, dan event tanpa order tidak punya peserta yang berbelanja.
--
-- Balapan dengan order yang masuk bersamaan tidak perlu penguncian tambahan:
-- `orders.event_id -> events(id) on delete restrict` akan menolak langkah
-- terakhir dengan 23503 dan membatalkan seluruh transaksi. Databasenya sendiri
-- yang menjadi penjaganya, bukan hitungan yang sudah basi sedetik kemudian.
-- ============================================================================

create or replace function public.delete_event(
  p_event_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events;
  n_orders bigint;
  hitungan jsonb;
begin
  -- FOR UPDATE menahan dua admin yang menekan Hapus bersamaan: yang kedua
  -- menunggu, lalu membaca baris yang sudah hilang dan berhenti di
  -- EVENT_NOT_FOUND -- bukan mengulang penghapusan setengah jalan.
  select * into ev from public.events where id = p_event_id for update;
  if ev.id is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if ev.status not in ('draft', 'archived') then
    raise exception 'EVENT_NOT_DELETABLE';
  end if;

  select count(*) into n_orders from public.orders where event_id = p_event_id;
  if n_orders > 0 then
    raise exception 'EVENT_HAS_ORDERS';
  end if;

  -- Dihitung SEBELUM dihapus. Angka ini dikembalikan ke pemanggil dan ikut
  -- masuk log, sehingga "event hilang" bisa dijawab dengan apa saja yang
  -- sebenarnya ikut terbuang -- bukan dengan tebakan berbulan kemudian.
  select jsonb_build_object(
    'participants',   (select count(*) from public.participants        where event_id = p_event_id),
    'booths',         (select count(*) from public.booths              where event_id = p_event_id),
    'special_offers', (select count(*) from public.special_offers      where event_id = p_event_id),
    'registrations',  (select count(*) from public.event_registrations where event_id = p_event_id),
    'undian_prizes',  (select count(*) from public.undian_prizes       where event_id = p_event_id),
    'rundown_items',  (select count(*) from public.rundown_items       where event_id = p_event_id),
    'seat_map_sessions', (select count(*) from public.seat_map_sessions where event_id = p_event_id),
    'audit_logs',     (select count(*) from public.audit_logs          where event_id = p_event_id)
  ) into hitungan;

  -- 1. Log lebih dulu (lihat catatan 1 di kepala berkas). Cabang `order_id in
  --    (...)` menangkap baris warisan yang event_id-nya kosong tetapi menunjuk
  --    order milik event ini; dengan penjaga nol order ia tidak akan menemukan
  --    apa pun hari ini, dan tetap benar bila penjaganya kelak dilonggarkan.
  delete from public.audit_logs
   where event_id = p_event_id
      or order_id in (select id from public.orders where event_id = p_event_id);

  delete from public.order_special_items where event_id = p_event_id;
  delete from public.orders              where event_id = p_event_id;

  -- Lihat catatan 4. Winners lebih dulu (ia anak dari sessions DAN participants),
  -- lalu prizes SEBELUM entry_groups -- bukan sesudahnya.
  delete from public.undian_winners         where event_id = p_event_id;
  delete from public.undian_entries         where event_id = p_event_id;
  delete from public.undian_exclusion_rules where event_id = p_event_id;
  delete from public.undian_exclusions      where event_id = p_event_id;
  delete from public.undian_prizes          where event_id = p_event_id;
  delete from public.undian_entry_groups    where event_id = p_event_id;
  delete from public.undian_sessions        where event_id = p_event_id;

  delete from public.leaderboard_exclusions where event_id = p_event_id;

  delete from public.rundown_items    where event_id = p_event_id;
  delete from public.rundown_sections where event_id = p_event_id;

  -- Lihat catatan 2: sesi harus lepas sebelum seat_maps ikut CASCADE.
  delete from public.seat_map_sessions where event_id = p_event_id;

  delete from public.event_registrations where event_id = p_event_id;
  delete from public.special_offers      where event_id = p_event_id;
  delete from public.participants        where event_id = p_event_id;

  -- Lihat catatan 4: hak akses yang menunjuk booth harus lepas sebelum boothnya
  -- hilang, meski barisnya toh akan ikut CASCADE beberapa baris lagi.
  delete from public.user_event_access where event_id = p_event_id;
  delete from public.booths            where event_id = p_event_id;

  -- CASCADE menyapu ketujuh tabel setelan.
  delete from public.events where id = p_event_id;

  -- event_id NULL karena eventnya memang sudah tidak ada, dan kolom itu
  -- `on delete set null`. Nama serta slug disimpan di payload supaya barisnya
  -- tetap bisa dibaca tanpa event yang dirujuk.
  insert into public.audit_logs (event_id, user_id, action, payload)
  values (null, p_actor, 'event_deleted',
          jsonb_build_object('event_id', p_event_id, 'slug', ev.slug, 'name', ev.name,
                             'status', ev.status, 'deleted', hitungan));

  return jsonb_build_object('slug', ev.slug, 'name', ev.name, 'deleted', hitungan);
end $$;

revoke all on function public.delete_event(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_event(uuid, uuid) to service_role;

comment on function public.delete_event(uuid, uuid) is
  'Hapus event permanen beserta seluruh data anaknya, dalam satu transaksi. Hanya untuk status draft/archived tanpa order.';
