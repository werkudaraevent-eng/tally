-- Duplikasi event: menyalin KONFIGURASI, bukan DATA.
--
-- Alasan ini sebuah RPC dan bukan rangkaian panggilan dari route handler:
-- separuh jadi jauh lebih buruk daripada gagal. Event salinan yang punya booth
-- tapi kehilangan penawaran spesialnya terlihat siap dipakai, dan kesalahannya
-- baru muncul saat peserta pertama menebus item di lapangan.
-- Satu fungsi = satu transaksi = tidak ada keadaan setengah jadi.
--
-- YANG DISALIN (konfigurasi -- hasil kerja panitia sebelum acara):
--   event_settings, display_settings, rundown_settings, undian_settings,
--   booths, special_offers, rundown_sections + items, seat_maps +
--   seat_map_sessions, undian_prizes, undian_entry_groups + entries,
--   undian_exclusion_rules, leaderboard_exclusions (kata kunci perusahaan saja).
--
-- YANG TIDAK DISALIN (data -- lahir dari acara yang sudah berjalan):
--   participants, orders, order_special_items, undian_winners, undian_sessions,
--   audit_logs, user_event_access.
--   * peserta: milik acara itu; QR-nya sudah di tangan orang lain.
--   * order: menyalinnya berarti mengarang uang di laporan event baru.
--   * pemenang undian: hadiah sudah diserahkan; salinan = klaim ganda.
--   * user_event_access: siapa boleh mengakses adalah keputusan orang, bukan
--     turunan konfigurasi. Menyalinnya diam-diam memberi 15 orang akses ke
--     event yang mungkin milik klien lain.
--   * leaderboard_exclusions dengan participant_id ikut TIDAK disalin: peserta
--     itu tidak ada di event baru. Hanya baris company_keyword yang dibawa.
--
-- Teknik: `jsonb_populate_record` lalu MENIMPA kolom yang tidak boleh ikut.
-- Menyebut seluruh kolom satu per satu berarti setiap kolom baru yang
-- ditambahkan nanti diam-diam TIDAK ikut tersalin, tanpa ada yang gagal untuk
-- memberi tahu. Yang disebut eksplisit hanya kolom yang harus DIGANTI -- daftar
-- itu pendek dan stabil (id, event_id, kunci induk, jejak audit).
--
-- PENTING: kolom diTIMPA, bukan dibuang dengan `- 'id'`. Membuangnya membuat
-- nilainya NULL di dalam record, dan NULL yang dikirim EKSPLISIT tidak memicu
-- DEFAULT kolom -- insert-nya gagal 23502 pada id dan created_at. Karena itu
-- setiap id diisi `nextval` dari sequence tabelnya sendiri.
--
-- Id booth/section/grup/hadiah BERUBAH, jadi setiap kolom yang menunjuknya
-- diterjemahkan lewat peta jsonb `id lama (text) -> id baru`. Menyalin booth_id
-- mentah akan menunjuk booth event lain -- persis kebocoran yang ditutup FK
-- komposit, tetapi lahir dari fitur ini sendiri.

drop function if exists public.duplicate_event(uuid, text, text, date, uuid);

create function public.duplicate_event(
  p_source_event_id uuid,
  p_slug text,
  p_name text,
  p_event_date date,
  p_actor uuid,
  p_scanner_slug text default null
)
returns public.events
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  sumber public.events;
  baru public.events;
  sumber_peserta text;
  scanner_slug text;
  daftar_publik boolean;
  peta_booth jsonb := '{}'::jsonb;
  peta_seat_map jsonb := '{}'::jsonb;
  peta_section jsonb := '{}'::jsonb;
  peta_grup jsonb := '{}'::jsonb;
  peta_hadiah jsonb := '{}'::jsonb;
  baris record;
  id_baru bigint;
  slug_sesi_bawaan text;
  jumlah jsonb := '{}'::jsonb;
  n int;
begin
  select * into sumber from public.events where id = p_source_event_id;
  if not found then raise exception using errcode = 'P0002', message = 'EVENT_NOT_FOUND'; end if;

  scanner_slug := nullif(btrim(coalesce(p_scanner_slug, '')), '');
  sumber_peserta := sumber.participant_source;
  daftar_publik := sumber.registration_enabled;

  -- Slug Scanner API TIDAK pernah diwarisi diam-diam: event salinan akan
  -- menarik peserta acara LAIN setiap 5 menit lewat cron, tanpa ada yang
  -- meminta. Pemanggil harus menyebutkannya secara sadar.
  -- Kalau tidak disebutkan, sumber peserta ikut diturunkan, karena CHECK
  -- events_scanner_slug_required mewajibkan slug untuk scanner_api/hybrid --
  -- membiarkan sumbernya utuh membuat insert gagal 23514.
  -- hybrid turun ke public_form (bukan manual) supaya form registrasi yang
  -- sudah dikonfigurasi tetap hidup; menurunkannya ke manual akan mematikan
  -- registration_enabled tanpa ada yang meminta.
  if scanner_slug is null then
    if sumber_peserta = 'scanner_api' then
      sumber_peserta := 'manual';
      daftar_publik := false;
    elsif sumber_peserta = 'hybrid' then
      sumber_peserta := 'public_form';
    end if;
  end if;

  insert into public.events (slug, name, description, event_date, status, participant_source,
    scanner_api_event_slug, registration_enabled, registration_form_config, time_zone, created_by)
  values (p_slug, p_name, sumber.description, p_event_date,
    -- Selalu 'draft'. Salinan belum punya peserta, dan status aktif membuatnya
    -- langsung jadi kandidat di jalur publik tanpa slug.
    'draft', sumber_peserta, scanner_slug,
    daftar_publik, sumber.registration_form_config, sumber.time_zone, p_actor)
  returning * into baru;

  -- ---------------------------------------------------------------------
  -- Tabel settings (satu baris per event)
  -- ---------------------------------------------------------------------
  insert into public.event_settings
  select (jsonb_populate_record(null::public.event_settings, to_jsonb(s) || jsonb_build_object(
    'id', nextval('public.event_settings_id_seq'), 'event_id', baru.id,
    'updated_at', now(), 'updated_by', p_actor))).*
  from public.event_settings s where s.event_id = p_source_event_id;

  insert into public.display_settings
  select (jsonb_populate_record(null::public.display_settings, to_jsonb(s) || jsonb_build_object(
    'id', nextval('public.display_settings_id_seq'), 'event_id', baru.id,
    'updated_at', now(), 'updated_by', p_actor))).*
  from public.display_settings s where s.event_id = p_source_event_id;

  insert into public.rundown_settings
  select (jsonb_populate_record(null::public.rundown_settings, to_jsonb(s) || jsonb_build_object(
    'id', nextval('public.rundown_settings_id_seq'), 'event_id', baru.id,
    'updated_at', now(), 'updated_by', p_actor))).*
  from public.rundown_settings s where s.event_id = p_source_event_id;

  insert into public.undian_settings
  select (jsonb_populate_record(null::public.undian_settings, to_jsonb(s) || jsonb_build_object(
    'id', nextval('public.undian_settings_id_seq'), 'event_id', baru.id,
    'updated_at', now(), 'updated_by', p_actor))).*
  from public.undian_settings s where s.event_id = p_source_event_id;

  -- leaderboard_reveal dan undian_state adalah tabel CAMPURAN: sebagian besar
  -- kolomnya runtime (stage, snapshot, frozen_at, phase, draw_round), tetapi
  -- `stages` adalah konfigurasi -- definisi rentang tahap yang disusun panitia.
  -- Menyalin seluruh baris membawa snapshot papan acara LAMA ke event baru dan
  -- ia akan tayang di proyektor. Melewatkan barisnya sama sekali membuat kedua
  -- fitur mati tanpa baris untuk di-update. Barisnya dibuat DI SINI, bukan lewat
  -- fungsi terpisah: pemanggil yang lupa memanggilnya menghasilkan event yang
  -- rusak tanpa galat yang menyebut penyebabnya.
  insert into public.leaderboard_reveal (event_id, stages, freeze_on_start)
  select baru.id, r.stages, r.freeze_on_start
  from public.leaderboard_reveal r where r.event_id = p_source_event_id;
  if not found then
    insert into public.leaderboard_reveal (event_id) values (baru.id);
  end if;

  insert into public.undian_state (event_id) values (baru.id);

  -- ---------------------------------------------------------------------
  -- Booth + penawaran
  -- ---------------------------------------------------------------------
  for baris in select * from public.booths where event_id = p_source_event_id order by id loop
    id_baru := nextval('public.booths_id_seq');
    insert into public.booths
    select (jsonb_populate_record(null::public.booths, to_jsonb(baris) || jsonb_build_object(
      'id', id_baru, 'event_id', baru.id))).*;
    peta_booth := peta_booth || jsonb_build_object(baris.id::text, id_baru);
  end loop;

  -- Penawaran bawaan sudah dibuat otomatis oleh trigger sync_booth_builtin_offer
  -- saat booth di atas di-insert, jadi hanya penawaran non-bawaan yang disalin.
  -- Menyalin yang bawaan akan bentrok dengan hasil trigger di (event_id, code).
  insert into public.special_offers
  select (jsonb_populate_record(null::public.special_offers, to_jsonb(o) || jsonb_build_object(
    'id', nextval('public.special_offers_id_seq'), 'event_id', baru.id,
    'booth_id', peta_booth -> o.booth_id::text,
    'created_at', now(), 'created_by', p_actor))).*
  from public.special_offers o
  where o.event_id = p_source_event_id and not o.is_builtin
    and o.booth_id is not null and peta_booth ? o.booth_id::text;

  -- ---------------------------------------------------------------------
  -- Rundown
  -- ---------------------------------------------------------------------
  for baris in select * from public.rundown_sections where event_id = p_source_event_id order by id loop
    id_baru := nextval('public.rundown_sections_id_seq');
    insert into public.rundown_sections
    select (jsonb_populate_record(null::public.rundown_sections, to_jsonb(baris) || jsonb_build_object(
      'id', id_baru, 'event_id', baru.id,
      'created_at', now(), 'updated_at', now(), 'updated_by', p_actor))).*;
    peta_section := peta_section || jsonb_build_object(baris.id::text, id_baru);
  end loop;

  insert into public.rundown_items
  select (jsonb_populate_record(null::public.rundown_items, to_jsonb(i) || jsonb_build_object(
    'id', nextval('public.rundown_items_id_seq'), 'event_id', baru.id,
    'section_id', peta_section -> i.section_id::text,
    'created_at', now(), 'updated_at', now(), 'updated_by', p_actor))).*
  from public.rundown_items i
  where i.event_id = p_source_event_id and peta_section ? i.section_id::text;

  -- ---------------------------------------------------------------------
  -- Denah. seat_maps.default_session_id menunjuk sesi yang belum ada saat peta
  -- dibuat, jadi ia dikosongkan dulu lalu diisi ulang lewat SLUG -- satu-satunya
  -- penanda yang stabil setelah id berubah.
  -- ---------------------------------------------------------------------
  select ses.slug into slug_sesi_bawaan
  from public.seat_maps m
  join public.seat_map_sessions ses on ses.id = m.default_session_id
  where m.event_id = p_source_event_id
  limit 1;

  for baris in select * from public.seat_maps where event_id = p_source_event_id order by id loop
    id_baru := nextval('public.seat_maps_id_seq');
    insert into public.seat_maps
    select (jsonb_populate_record(null::public.seat_maps, to_jsonb(baris) || jsonb_build_object(
      'id', id_baru, 'event_id', baru.id, 'default_session_id', null,
      'updated_at', now(), 'updated_by', p_actor))).*;
    peta_seat_map := peta_seat_map || jsonb_build_object(baris.id::text, id_baru);
  end loop;

  insert into public.seat_map_sessions
  select (jsonb_populate_record(null::public.seat_map_sessions, to_jsonb(s) || jsonb_build_object(
    'id', nextval('public.seat_map_sessions_id_seq'), 'event_id', baru.id,
    'seat_map_id', peta_seat_map -> s.seat_map_id::text,
    'created_at', now(), 'updated_at', now(), 'updated_by', p_actor))).*
  from public.seat_map_sessions s
  where s.event_id = p_source_event_id and peta_seat_map ? s.seat_map_id::text;

  if slug_sesi_bawaan is not null then
    update public.seat_maps m
    set default_session_id = (
      select ses.id from public.seat_map_sessions ses
      where ses.event_id = baru.id and ses.slug = slug_sesi_bawaan limit 1)
    where m.event_id = baru.id;
  end if;

  -- ---------------------------------------------------------------------
  -- Undian: hadiah + grup entri. Pemenang dan sesi TIDAK ikut.
  -- ---------------------------------------------------------------------
  for baris in select * from public.undian_entry_groups where event_id = p_source_event_id order by id loop
    id_baru := nextval('public.undian_entry_groups_id_seq');
    insert into public.undian_entry_groups
    select (jsonb_populate_record(null::public.undian_entry_groups, to_jsonb(baris) || jsonb_build_object(
      'id', id_baru, 'event_id', baru.id, 'created_at', now(), 'created_by', p_actor))).*;
    peta_grup := peta_grup || jsonb_build_object(baris.id::text, id_baru);
  end loop;

  insert into public.undian_entries
  select (jsonb_populate_record(null::public.undian_entries, to_jsonb(e) || jsonb_build_object(
    'id', nextval('public.undian_entries_id_seq'), 'event_id', baru.id,
    'group_id', peta_grup -> e.group_id::text, 'created_at', now()))).*
  from public.undian_entries e
  where e.event_id = p_source_event_id and peta_grup ? e.group_id::text;

  for baris in select * from public.undian_prizes where event_id = p_source_event_id order by id loop
    id_baru := nextval('public.undian_prizes_id_seq');
    insert into public.undian_prizes
    select (jsonb_populate_record(null::public.undian_prizes, to_jsonb(baris) || jsonb_build_object(
      'id', id_baru, 'event_id', baru.id,
      'entry_group_id', case when baris.entry_group_id is null then null
                             else peta_grup -> baris.entry_group_id::text end,
      'created_at', now(), 'updated_at', now(), 'updated_by', p_actor))).*;
    peta_hadiah := peta_hadiah || jsonb_build_object(baris.id::text, id_baru);
  end loop;

  insert into public.undian_exclusion_rules
  select (jsonb_populate_record(null::public.undian_exclusion_rules, to_jsonb(r) || jsonb_build_object(
    'id', nextval('public.undian_exclusion_rules_id_seq'), 'event_id', baru.id,
    'prize_id', case when r.prize_id is null then null else peta_hadiah -> r.prize_id::text end,
    'created_at', now(), 'updated_at', now(), 'created_by', p_actor, 'updated_by', p_actor))).*
  from public.undian_exclusion_rules r
  where r.event_id = p_source_event_id
    and (r.prize_id is null or peta_hadiah ? r.prize_id::text);

  -- ---------------------------------------------------------------------
  -- Diskualifikasi leaderboard: HANYA yang berbasis kata kunci perusahaan.
  -- Baris ber-participant_id menunjuk orang yang tidak ada di event baru.
  -- ---------------------------------------------------------------------
  insert into public.leaderboard_exclusions
  select (jsonb_populate_record(null::public.leaderboard_exclusions, to_jsonb(x) || jsonb_build_object(
    'id', nextval('public.leaderboard_exclusions_id_seq'), 'event_id', baru.id,
    'created_at', now(), 'created_by', p_actor))).*
  from public.leaderboard_exclusions x
  where x.event_id = p_source_event_id and x.company_keyword is not null;

  -- Ringkasan dicatat supaya panitia bisa memeriksa apa yang benar-benar ikut,
  -- bukan menebak dari layar yang tampak sudah terisi.
  select count(*) into n from public.booths where event_id = baru.id;
  jumlah := jumlah || jsonb_build_object('booth', n);
  select count(*) into n from public.special_offers where event_id = baru.id;
  jumlah := jumlah || jsonb_build_object('penawaran', n);
  select count(*) into n from public.rundown_items where event_id = baru.id;
  jumlah := jumlah || jsonb_build_object('rundown_item', n);
  select count(*) into n from public.undian_prizes where event_id = baru.id;
  jumlah := jumlah || jsonb_build_object('hadiah', n);
  select count(*) into n from public.undian_entries where event_id = baru.id;
  jumlah := jumlah || jsonb_build_object('entri_undian', n);
  select count(*) into n from public.seat_map_sessions where event_id = baru.id;
  jumlah := jumlah || jsonb_build_object('sesi_denah', n);

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (baru.id, p_actor, 'event_duplicate', jsonb_build_object(
    'sumber_id', p_source_event_id, 'sumber_slug', sumber.slug,
    'slug', baru.slug, 'sumber_peserta', sumber_peserta, 'disalin', jumlah));

  return baru;
end;
$function$;

revoke all on function public.duplicate_event(uuid, text, text, date, uuid, text) from public;
grant execute on function public.duplicate_event(uuid, text, text, date, uuid, text) to service_role;
