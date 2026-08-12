-- ============================================================================
-- Jaring pengaman: DEFAULT event_id untuk semua tabel ber-event_id NOT NULL.
--
-- MASALAH YANG DIUKUR: 22 tabel punya `event_id NOT NULL` tanpa pengisi apa pun
-- (hanya orders dan order_special_items yang punya trigger dari 202608070005).
-- Akibatnya setiap jalur insert lama GAGAL 23502. Terbukti: penarikan undian
-- sudah mati sebelum perbaikan ini —
--   insert undian_winners tanpa event_id -> 23502
--   insert undian_state   tanpa event_id -> 23502
-- Kelas bug yang sama dengan create_order_transaction: build hijau, GET sehat,
-- tapi tombol di atas panggung tidak berfungsi.
--
-- DEFAULT, bukan trigger: sebagian tabel ini (booths, undian_prizes, settings)
-- tidak punya induk untuk diturunkan, jadi tidak ada yang bisa dibaca trigger.
--
-- `resolve_event_id(null)` MELEMPAR saat >1 event aktif, dan itu memang yang
-- diinginkan: nilai default tidak boleh menebak event. Jalur yang benar adalah
-- route handler mengirim event_id EKSPLISIT — bila kolom diisi, DEFAULT tidak
-- pernah dievaluasi. Default ini hanya jaring pengaman untuk kode lama yang
-- belum discope.
--
-- Untuk tabel ANAK (rundown_items, undian_entries, seat_map_sessions, ...) nilai
-- default bisa saja tidak cocok dengan induknya. Itu aman: FK komposit dari
-- TAHAP 2/3 menolaknya dengan 23503 — gagal nyaring, bukan diam-diam salah.
--
-- Diuji (4/4): terisi otomatis saat 1 event aktif; eksplisit tetap dipakai;
-- ditolak P0009 saat 2 event aktif; eksplisit tetap jalan saat 2 event aktif.
-- Sesudah diterapkan, keempat jalur ini BERHASIL kembali: tarik undian, buat
-- hadiah, buat rundown section, buat pengecualian leaderboard.
--
-- `user_event_access` SENGAJA tidak diberi default: baris itu justru menyatakan
-- event mana yang diberikan, jadi menebaknya menghapus makna tabelnya.
-- `audit_logs.event_id` NULLABLE dan juga tanpa default: aksi tingkat sistem
-- (membuat event, kelola user global) memang tidak punya event, dan default akan
-- menempelkannya ke event acak.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'booths', 'participants', 'special_offers',
    'event_settings', 'display_settings', 'seat_maps', 'seat_map_sessions',
    'rundown_settings', 'rundown_sections', 'rundown_items',
    'undian_settings', 'undian_state', 'undian_prizes', 'undian_sessions',
    'undian_entry_groups', 'undian_entries', 'undian_exclusions',
    'undian_exclusion_rules', 'undian_winners',
    'leaderboard_reveal', 'leaderboard_exclusions'
  ]
  loop
    execute format(
      'alter table public.%I alter column event_id set default public.resolve_event_id(null)', t
    );
  end loop;
end $$;
