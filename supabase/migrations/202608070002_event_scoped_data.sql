-- ============================================================================
-- Multi-event TAHAP 2: event_id pada tabel data + FK komposit anti-bocor
--
-- Tahap ini menambahkan event_id ke tabel yang memuat DATA acara, lalu
-- menegakkan keterikatan antar-tabel dengan FK KOMPOSIT.
--
-- Mengapa FK komposit, bukan FK biasa:
--   `orders.booth_id -> booths(id)` tidak menjaga event. Order milik event A
--   bisa menunjuk booth milik event B, dan gejalanya BUKAN galat -- nominalnya
--   ikut terhitung di leaderboard event yang salah dan tidak ada yang tahu.
--   Dengan `unique (event_id, id)` di induk lalu
--   `foreign key (event_id, booth_id) references booths(event_id, id)`,
--   percobaan itu ditolak database dengan 23503. Sudah diukur.
--
-- Tabel SETTINGS (event_settings, display_settings, seat_maps,
-- rundown_settings, leaderboard_reveal, undian_settings, undian_state) TIDAK
-- disentuh di sini. Ketujuhnya punya `CHECK (id = 1)` dan primary key yang
-- dirujuk FK anak, jadi butuh urutan pembongkaran sendiri -> TAHAP 3.
--
-- Setelah migrasi ini aplikasi lama MASIH BERJALAN SAMA: setiap kolom baru
-- terisi penuh dan tidak ada satu pun query lama yang wajib memakainya.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Event tujuan backfill
-- ---------------------------------------------------------------------------

do $$
declare v_event_id uuid;
begin
  select id into v_event_id from public.events where slug = 'prima-executive-gathering-2026';
  if v_event_id is null then
    raise exception 'Event pertama tidak ditemukan. Jalankan 202608070001_events_registry.sql lebih dulu.';
  end if;
  -- Dipakai lintas statement di migrasi ini.
  perform set_config('multi_event.seed_id', v_event_id::text, false);
end $$;

-- ---------------------------------------------------------------------------
-- 1. Induk: booths & participants
--
-- Keduanya lebih dulu karena tabel lain menunjuk ke sini.
-- ---------------------------------------------------------------------------

alter table public.booths add column event_id uuid references public.events(id) on delete restrict;
alter table public.participants add column event_id uuid references public.events(id) on delete restrict;

update public.booths set event_id = current_setting('multi_event.seed_id')::uuid where event_id is null;
update public.participants set event_id = current_setting('multi_event.seed_id')::uuid where event_id is null;

alter table public.booths alter column event_id set not null;
alter table public.participants alter column event_id set not null;

-- Kunci komposit yang dipakai FK anak. `unique (event_id, id)` bukan pengganti
-- primary key -- `id` tetap primary key, sehingga FK lama dan seluruh query
-- yang memakai booth_id tunggal tidak berubah sama sekali.
alter table public.booths add constraint booths_event_id_unique unique (event_id, id);
alter table public.participants add constraint participants_event_id_unique unique (event_id, id);

-- Kode booth unik PER EVENT. Event berikutnya boleh punya B1 sendiri.
alter table public.booths drop constraint if exists booths_code_key;
create unique index booths_code_event_unique on public.booths (event_id, code);

-- qr_code unik per event. Scanner API memberi kode unik global, tetapi event
-- yang datanya diimpor manual bisa memakai penomoran sendiri yang bertabrakan
-- dengan event lain.
alter table public.participants drop constraint if exists participants_qr_code_key;
create unique index participants_qr_code_event_unique on public.participants (event_id, qr_code);

-- ---------------------------------------------------------------------------
-- 2. orders
-- ---------------------------------------------------------------------------

alter table public.orders add column event_id uuid references public.events(id) on delete restrict;
update public.orders set event_id = current_setting('multi_event.seed_id')::uuid where event_id is null;
alter table public.orders alter column event_id set not null;

alter table public.orders add constraint orders_event_id_unique unique (event_id, id);

-- Kode order unik per event: setiap event memulai penomoran stikernya sendiri.
alter table public.orders drop constraint if exists orders_code_key;
create unique index orders_code_event_unique on public.orders (event_id, code);

-- Inti tahap ini. Booth DAN peserta wajib berasal dari event yang sama.
alter table public.orders
  add constraint orders_booth_same_event
  foreign key (event_id, booth_id) references public.booths(event_id, id);

alter table public.orders
  add constraint orders_participant_same_event
  foreign key (event_id, participant_id) references public.participants(event_id, id);

-- ---------------------------------------------------------------------------
-- 3. special_offers
-- ---------------------------------------------------------------------------

alter table public.special_offers add column event_id uuid references public.events(id) on delete restrict;
update public.special_offers set event_id = current_setting('multi_event.seed_id')::uuid where event_id is null;
alter table public.special_offers alter column event_id set not null;

alter table public.special_offers add constraint special_offers_event_id_unique unique (event_id, id);

alter table public.special_offers drop constraint if exists special_offers_code_key;
create unique index special_offers_code_event_unique on public.special_offers (event_id, code);

-- Penawaran per-booth wajib menunjuk booth di event yang sama. booth_id boleh
-- NULL (penawaran global); FK komposit tidak berlaku untuk baris NULL, sesuai
-- MATCH SIMPLE bawaan Postgres.
alter table public.special_offers
  add constraint special_offers_booth_same_event
  foreign key (event_id, booth_id) references public.booths(event_id, id);

-- Diskon bawaan booth: satu per booth PER EVENT.
drop index if exists special_offers_builtin_booth_idx;
create unique index special_offers_builtin_event_booth_idx
  on public.special_offers (event_id, booth_id) where is_builtin;

-- ---------------------------------------------------------------------------
-- 4. order_special_items
--
-- Tidak diberi event_id sendiri. Ia sudah terikat ke satu order, dan order
-- sudah punya event_id -- menambah kolom kedua membuka kemungkinan dua nilai
-- yang saling bertentangan untuk baris yang sama.
--
-- Yang dijaga di sini: klaim tidak boleh memakai penawaran dari event lain.
-- Karena tidak ada event_id lokal, keterikatan ditegakkan lewat kolom turunan
-- yang WAJIB sama dengan event ordernya.
-- ---------------------------------------------------------------------------

alter table public.order_special_items add column event_id uuid references public.events(id) on delete restrict;

update public.order_special_items osi
set event_id = o.event_id
from public.orders o
where o.id = osi.order_id and osi.event_id is null;

-- `order_special_items_validate_total` adalah DEFERRED constraint trigger: ia
-- mengantre sampai akhir transaksi. UPDATE di atas mengisi antrean itu, dan
-- Postgres menolak ALTER TABLE selama masih ada trigger tertunda dengan
--   55006 cannot ALTER TABLE ... because it has pending trigger events
-- Memaksanya IMMEDIATE membuat antrean dibereskan di sini, sekaligus
-- memverifikasi bahwa total setiap order masih sah setelah backfill.
set constraints public.order_special_items_validate_total immediate;

alter table public.order_special_items alter column event_id set not null;

-- event_id di sini harus IKUT ordernya, tidak boleh diisi bebas.
alter table public.order_special_items
  drop constraint if exists order_special_items_order_id_fkey;
alter table public.order_special_items
  add constraint order_special_items_order_same_event
  foreign key (event_id, order_id) references public.orders(event_id, id) on delete cascade;

alter table public.order_special_items
  add constraint order_special_items_offer_same_event
  foreign key (event_id, offer_id) references public.special_offers(event_id, id);

-- ---------------------------------------------------------------------------
-- 5. Undian
-- ---------------------------------------------------------------------------

alter table public.undian_prizes add column event_id uuid references public.events(id) on delete restrict;
alter table public.undian_sessions add column event_id uuid references public.events(id) on delete restrict;
alter table public.undian_entry_groups add column event_id uuid references public.events(id) on delete restrict;

update public.undian_prizes set event_id = current_setting('multi_event.seed_id')::uuid where event_id is null;
update public.undian_sessions set event_id = current_setting('multi_event.seed_id')::uuid where event_id is null;
update public.undian_entry_groups set event_id = current_setting('multi_event.seed_id')::uuid where event_id is null;

alter table public.undian_prizes alter column event_id set not null;
alter table public.undian_sessions alter column event_id set not null;
alter table public.undian_entry_groups alter column event_id set not null;

alter table public.undian_prizes add constraint undian_prizes_event_id_unique unique (event_id, id);
alter table public.undian_sessions add constraint undian_sessions_event_id_unique unique (event_id, id);
alter table public.undian_entry_groups add constraint undian_entry_groups_event_id_unique unique (event_id, id);

-- Satu sesi aktif PER EVENT, bukan satu untuk seluruh sistem. Tanpa ini,
-- membuka sesi undian di event A memblokir event B yang berjalan bersamaan.
drop index if exists undian_sessions_single_active;
create unique index undian_sessions_single_active_per_event
  on public.undian_sessions (event_id, status) where status = 'active';

alter table public.undian_prizes
  add constraint undian_prizes_group_same_event
  foreign key (event_id, entry_group_id) references public.undian_entry_groups(event_id, id) on delete set null;

-- undian_winners: event_id diturunkan dari hadiah, dan peserta wajib se-event.
-- participant_id boleh NULL (pemenang dari daftar manual, bukan peserta).
alter table public.undian_winners add column event_id uuid references public.events(id) on delete restrict;

update public.undian_winners w
set event_id = p.event_id
from public.undian_prizes p
where p.id = w.prize_id and w.event_id is null;

-- Sisa baris (hadiah sudah terhapus) jatuh ke event pertama.
update public.undian_winners set event_id = current_setting('multi_event.seed_id')::uuid where event_id is null;
alter table public.undian_winners alter column event_id set not null;

alter table public.undian_winners drop constraint if exists undian_winners_prize_id_fkey;
alter table public.undian_winners
  add constraint undian_winners_prize_same_event
  foreign key (event_id, prize_id) references public.undian_prizes(event_id, id) on delete cascade;

alter table public.undian_winners drop constraint if exists undian_winners_session_id_fkey;
alter table public.undian_winners
  add constraint undian_winners_session_same_event
  foreign key (event_id, session_id) references public.undian_sessions(event_id, id) on delete set null;

alter table public.undian_winners drop constraint if exists undian_winners_participant_id_fkey;
alter table public.undian_winners
  add constraint undian_winners_participant_same_event
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete set null;

-- undian_entries mengikuti grupnya.
alter table public.undian_entries add column event_id uuid references public.events(id) on delete restrict;

update public.undian_entries e
set event_id = g.event_id
from public.undian_entry_groups g
where g.id = e.group_id and e.event_id is null;

alter table public.undian_entries alter column event_id set not null;

alter table public.undian_entries drop constraint if exists undian_entries_group_id_fkey;
alter table public.undian_entries
  add constraint undian_entries_group_same_event
  foreign key (event_id, group_id) references public.undian_entry_groups(event_id, id) on delete cascade;

-- undian_exclusions & undian_exclusion_rules
alter table public.undian_exclusions add column event_id uuid references public.events(id) on delete restrict;

update public.undian_exclusions x
set event_id = p.event_id
from public.participants p
where p.id = x.participant_id and x.event_id is null;

update public.undian_exclusions set event_id = current_setting('multi_event.seed_id')::uuid where event_id is null;
alter table public.undian_exclusions alter column event_id set not null;

alter table public.undian_exclusions drop constraint if exists undian_exclusions_participant_id_fkey;
alter table public.undian_exclusions
  add constraint undian_exclusions_participant_same_event
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete cascade;

-- Primary key lama hanya participant_id, artinya satu peserta tidak bisa
-- dikecualikan di dua event. Diganti komposit.
alter table public.undian_exclusions drop constraint if exists undian_exclusions_pkey;
alter table public.undian_exclusions add primary key (event_id, participant_id);

alter table public.undian_exclusion_rules add column event_id uuid references public.events(id) on delete restrict;

update public.undian_exclusion_rules r
set event_id = p.event_id
from public.undian_prizes p
where p.id = r.prize_id and r.event_id is null;

update public.undian_exclusion_rules set event_id = current_setting('multi_event.seed_id')::uuid where event_id is null;
alter table public.undian_exclusion_rules alter column event_id set not null;

alter table public.undian_exclusion_rules drop constraint if exists undian_exclusion_rules_prize_id_fkey;
alter table public.undian_exclusion_rules
  add constraint undian_exclusion_rules_prize_same_event
  foreign key (event_id, prize_id) references public.undian_prizes(event_id, id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 6. leaderboard_exclusions
-- ---------------------------------------------------------------------------

alter table public.leaderboard_exclusions add column event_id uuid references public.events(id) on delete restrict;
update public.leaderboard_exclusions set event_id = current_setting('multi_event.seed_id')::uuid where event_id is null;
alter table public.leaderboard_exclusions alter column event_id set not null;

alter table public.leaderboard_exclusions drop constraint if exists leaderboard_exclusions_participant_id_fkey;
alter table public.leaderboard_exclusions
  add constraint leaderboard_exclusions_participant_same_event
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete cascade;

-- Kata kunci & peserta unik PER EVENT: perusahaan yang digugurkan di satu event
-- belum tentu digugurkan di event lain.
drop index if exists leaderboard_exclusions_keyword_unique;
create unique index leaderboard_exclusions_keyword_event_unique
  on public.leaderboard_exclusions (event_id, lower(btrim(company_keyword)))
  where company_keyword is not null;

drop index if exists leaderboard_exclusions_participant_unique;
create unique index leaderboard_exclusions_participant_event_unique
  on public.leaderboard_exclusions (event_id, participant_id)
  where participant_id is not null;

-- ---------------------------------------------------------------------------
-- 7. rundown_sections & seat_map_sessions
--
-- Keduanya sudah punya `slug` yang dipakai di URL publik (?sesi=...). Slug itu
-- harus unik per event, bukan global.
-- ---------------------------------------------------------------------------

alter table public.rundown_sections add column event_id uuid references public.events(id) on delete restrict;
update public.rundown_sections set event_id = current_setting('multi_event.seed_id')::uuid where event_id is null;
alter table public.rundown_sections alter column event_id set not null;

alter table public.rundown_sections add constraint rundown_sections_event_id_unique unique (event_id, id);

alter table public.rundown_sections drop constraint if exists rundown_sections_slug_key;
create unique index rundown_sections_slug_event_unique on public.rundown_sections (event_id, slug);

-- rundown_items mengikuti sectionnya.
alter table public.rundown_items add column event_id uuid references public.events(id) on delete restrict;

update public.rundown_items i
set event_id = s.event_id
from public.rundown_sections s
where s.id = i.section_id and i.event_id is null;

alter table public.rundown_items alter column event_id set not null;

alter table public.rundown_items drop constraint if exists rundown_items_section_id_fkey;
alter table public.rundown_items
  add constraint rundown_items_section_same_event
  foreign key (event_id, section_id) references public.rundown_sections(event_id, id) on delete cascade;

alter table public.seat_map_sessions add column event_id uuid references public.events(id) on delete restrict;
update public.seat_map_sessions set event_id = current_setting('multi_event.seed_id')::uuid where event_id is null;
alter table public.seat_map_sessions alter column event_id set not null;

alter table public.seat_map_sessions drop constraint if exists seat_map_sessions_slug_key;
create unique index seat_map_sessions_slug_event_unique on public.seat_map_sessions (event_id, slug);

-- seat_map_id menunjuk seat_maps yang masih singleton (TAHAP 3). FK komposit
-- untuk pasangan ini dibuat setelah seat_maps punya event_id.

-- ---------------------------------------------------------------------------
-- 8. audit_logs
--
-- Tanpa event_id, jejak audit semua event bercampur dan tidak ada cara
-- memisahkannya. Kolomnya NULLABLE, berbeda dari tabel lain: aksi tingkat
-- sistem (membuat event, mengelola user global) memang tidak punya event, dan
-- memaksanya NOT NULL akan menempelkan aksi itu ke event acak.
-- ---------------------------------------------------------------------------

alter table public.audit_logs add column event_id uuid references public.events(id) on delete set null;

-- Baris audit yang menempel pada order mewarisi event ordernya.
update public.audit_logs a
set event_id = o.event_id
from public.orders o
where o.id = a.order_id and a.event_id is null;

-- Sisanya (2034 baris konfigurasi) milik event pertama: hanya event itu yang
-- ada saat baris-baris tersebut ditulis.
update public.audit_logs
set event_id = current_setting('multi_event.seed_id')::uuid
where event_id is null;

create index audit_logs_event_idx on public.audit_logs (event_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. user_event_access: booth wajib se-event (janji dari TAHAP 1)
-- ---------------------------------------------------------------------------

alter table public.user_event_access drop constraint if exists user_event_access_booth_id_fkey;
alter table public.user_event_access
  add constraint user_event_access_booth_same_event
  foreign key (event_id, booth_id) references public.booths(event_id, id) on delete set null;

-- Peran booth tanpa booth_id tidak bisa bekerja: layar /booth butuh booth mana.
alter table public.user_event_access
  add constraint user_event_access_booth_required
  check (role <> 'booth' or booth_id is not null);

-- ---------------------------------------------------------------------------
-- 10. Indeks untuk pola query per-event
-- ---------------------------------------------------------------------------

create index booths_event_idx on public.booths (event_id);
create index participants_event_idx on public.participants (event_id);
create index orders_event_idx on public.orders (event_id);
create index orders_event_status_idx on public.orders (event_id, status);
create index special_offers_event_idx on public.special_offers (event_id);
create index undian_winners_event_idx on public.undian_winners (event_id);

-- ---------------------------------------------------------------------------
-- 11. Verifikasi di dalam migrasi
--
-- Kalau backfill meninggalkan satu baris pun tanpa event_id, migrasi harus
-- GAGAL di sini, bukan lolos dan menyisakan data yang tak terlihat di UI mana
-- pun karena tidak cocok dengan event apa pun.
-- ---------------------------------------------------------------------------

do $$
declare v_kosong int;
begin
  select
    (select count(*) from public.booths where event_id is null)
    + (select count(*) from public.participants where event_id is null)
    + (select count(*) from public.orders where event_id is null)
    + (select count(*) from public.special_offers where event_id is null)
    + (select count(*) from public.order_special_items where event_id is null)
    + (select count(*) from public.undian_prizes where event_id is null)
    + (select count(*) from public.undian_winners where event_id is null)
    + (select count(*) from public.undian_entries where event_id is null)
    + (select count(*) from public.rundown_items where event_id is null)
    + (select count(*) from public.audit_logs where event_id is null)
  into v_kosong;

  if v_kosong > 0 then
    raise exception 'Backfill tidak lengkap: % baris tanpa event_id', v_kosong;
  end if;

  raise notice 'TAHAP 2 selesai. Semua baris punya event_id.';
end $$;
