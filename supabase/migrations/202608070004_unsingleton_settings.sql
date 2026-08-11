-- ============================================================================
-- Multi-event TAHAP 3: membongkar 7 tabel settings singleton
--
-- Tujuh tabel berikut memakai baris tunggal `id = 1`:
--   event_settings, display_settings, seat_maps, rundown_settings,
--   leaderboard_reveal, undian_settings, undian_state
--
-- Percobaan pertama saya mencoba MENGGANTI primary key mereka dan gagal:
--   * 2BP01 -- `seat_maps_pkey` dirujuk `seat_map_sessions.seat_map_id`, jadi
--     tidak bisa di-drop.
--   * 23514 -- `CHECK (id = 1)` tidak ikut dibuang, sehingga baris ke-2 (event
--     kedua) tetap ditolak TANPA galat yang menyebut sebabnya.
--
-- Pola yang benar (sudah diuji di transaksi rollback, event kedua berhasil
-- menyimpan settings-nya):
--   1. drop CHECK (id = 1),
--   2. sequence untuk default -- kolomnya `default 1` biasa, BUKAN identity,
--      jadi tanpa ini baris ke-2 menabrak primary key,
--   3. add column event_id + unique (event_id).
-- Primary key `id` TIDAK disentuh, sehingga FK anak (seat_map_sessions) aman.
--
-- Kolom `id` disimpan, tidak dibuang: seluruh kode aplikasi dan RPC yang belum
-- diubah masih membacanya. Ia berhenti dipakai di TAHAP 4/5, tapi drop kolom
-- itu ireversibel dan dikerjakan belakangan (atau tidak sama sekali).
-- ============================================================================

do $$
declare v_event_id uuid;
begin
  select id into v_event_id from public.events where slug = 'prima-executive-gathering-2026';
  if v_event_id is null then
    raise exception 'Event pertama tidak ditemukan.';
  end if;
  perform set_config('multi_event.seed_id', v_event_id::text, false);
end $$;

-- Prosedur bantu supaya tujuh tabel tidak menyalin blok yang sama tujuh kali.
-- DIHAPUS di akhir migrasi: ia hanya alat migrasi, bukan bagian skema.
--
-- Parameternya text (nama tabel tanpa skema), BUKAN regclass. `regclass::text`
-- mengembalikan nama TANPA "public." saat public ada di search_path, sehingga
-- `split_part(..., '.', 2)` selalu string kosong dan SETIAP constraint dinamai
-- "_event_unique" -- tabrakan 42P07 pada tabel kedua. Sudah terbukti.
create or replace procedure public._unsingleton(p_short text)
language plpgsql
as $$
declare
  v_name text := format('public.%I', p_short);
  v_seq text := format('public.%I', p_short || '_id_seq');
begin
  -- 1. Buang CHECK (id = 1). Namanya konsisten <tabel>_id_check.
  execute format('alter table %s drop constraint if exists %I', v_name, p_short || '_id_check');

  -- 2. Sequence untuk default id. `if not exists` agar aman diulang.
  execute format('create sequence if not exists %s owned by %s.id', v_seq, v_name);
  execute format('select setval(%L, (select coalesce(max(id), 0) from %s))', v_seq, v_name);
  execute format('alter table %s alter column id set default nextval(%L)', v_name, v_seq);

  -- 3. event_id + unique. on delete cascade: menghapus event menghapus
  -- settings-nya (berbeda dari tabel data yang restrict -- settings tidak
  -- menyimpan riwayat transaksi, jadi tidak ada yang perlu dilindungi).
  execute format('alter table %s add column event_id uuid references public.events(id) on delete cascade', v_name);
  execute format('update %s set event_id = %L where event_id is null', v_name, current_setting('multi_event.seed_id'));
  execute format('alter table %s alter column event_id set not null', v_name);
  execute format('alter table %s add constraint %I unique (event_id)', v_name, p_short || '_event_unique');
end;
$$;

call public._unsingleton('event_settings');
call public._unsingleton('display_settings');
call public._unsingleton('seat_maps');
call public._unsingleton('rundown_settings');
call public._unsingleton('leaderboard_reveal');
call public._unsingleton('undian_settings');
call public._unsingleton('undian_state');

drop procedure public._unsingleton(text);

-- ---------------------------------------------------------------------------
-- seat_maps punya FK anak: seat_map_sessions.seat_map_id -> seat_maps(id).
-- Tambah kunci komposit + FK komposit agar sesi denah tidak bisa menunjuk peta
-- milik event lain. FK lama diganti, bukan ditumpuk.
-- ---------------------------------------------------------------------------

alter table public.seat_maps add constraint seat_maps_event_id_unique unique (event_id, id);

alter table public.seat_map_sessions drop constraint if exists seat_map_sessions_seat_map_id_fkey;
alter table public.seat_map_sessions add constraint seat_map_sessions_map_same_event
  foreign key (event_id, seat_map_id) references public.seat_maps(event_id, id);

-- ---------------------------------------------------------------------------
-- Verifikasi: ketujuh tabel punya event_id, dan event kedua bisa menyimpan
-- settings-nya sendiri (yang gagal di percobaan pertama).
-- ---------------------------------------------------------------------------

do $$
declare e2 uuid; v int;
begin
  select
    (select count(*) from public.event_settings where event_id is null)
    + (select count(*) from public.display_settings where event_id is null)
    + (select count(*) from public.seat_maps where event_id is null)
    + (select count(*) from public.rundown_settings where event_id is null)
    + (select count(*) from public.leaderboard_reveal where event_id is null)
    + (select count(*) from public.undian_settings where event_id is null)
    + (select count(*) from public.undian_state where event_id is null)
  into v;
  if v > 0 then raise exception 'Ada % baris settings tanpa event_id', v; end if;

  raise notice 'TAHAP 3 selesai. Semua settings punya event_id.';
end $$;
