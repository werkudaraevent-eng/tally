-- ============================================================================
-- Siapa yang melihat sebuah baris Agenda (Agenda > Edit item > Who sees it).
-- Disetujui Hanung 2026-10-21 (KSO: empat batch keberangkatan dalam satu hari).
--
-- Satu kolom jsonb di rundown_items:
--
--   null                     semua peserta (bawaan)
--   [syarat, ...]            1 sampai 3 syarat; peserta melihat baris ini hanya
--                            bila SEMUA syarat cocok (DAN)
--
-- Satu syarat sama bentuknya dengan Who sees it blok Rute (#233):
--
--   {"field": "batch",  "values": ["Batch 1", "Batch 2"]}   salah satu jawaban (ATAU)
--   {"field": "@hotel", "values": ["12"]}                   tamu hotel id 12 (Logistics)
--
-- `field` adalah kunci pertanyaan pilihan peserta (participants.extra),
-- termasuk kolom khusus staf, atau `@hotel`. Baris yang bersyarat benar-benar
-- disembunyikan dari peserta lain (di server, gagal tertutup), dan tidak
-- pernah tampil di halaman acara publik, layar /rundown, maupun badge.
--
-- Hanya menambah satu kolom tanpa default (null) dan satu CHECK bentuk. Tidak
-- ada data yang diubah: setiap baris tetap untuk semua, jadi setiap acara
-- berubah 0 px. Hak akses tabel yang sudah ada berlaku untuk kolom baru.
-- Satu transaksi, aman dijalankan ulang.
--
-- Aman sebelum atau sesudah kodenya tayang: kode membaca kolom ini dengan
-- cadangan tanpa kolom bila belum ada (42703), dan menyimpan syarat sebelum
-- migrasi ini dijawab 409 AUDIENCE_NOT_READY.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.rundown_items
  add column if not exists audience jsonb;

alter table public.rundown_items drop constraint if exists rundown_items_audience_check;
-- CASE, bukan AND: kunci yang hilang memberi NULL, dan NULL lolos CHECK
-- (seperti 202610180002). Setiap jsonpath di bawah MENCARI syarat yang salah;
-- kunci yang hilang membuat predikat positifnya gagal, jadi syarat itu ikut
-- tertangkap dan CHECK menolak.
alter table public.rundown_items
  add constraint rundown_items_audience_check
  check (
    case
      when audience is null then true
      when jsonb_typeof(audience) = 'array' then coalesce(
        jsonb_array_length(audience) between 1 and 3
        -- setiap syarat objek dengan `field` teks yang sah
        and not jsonb_path_exists(audience, 'strict $[*] ? (@.type() != "object")')
        and not jsonb_path_exists(audience, 'lax $[*] ? (!(@.field.type() == "string"))')
        and not jsonb_path_exists(audience, 'lax $[*] ? (!(@.field like_regex "^([a-z0-9_]{1,64}|@hotel)$"))')
        -- `values` larik 1 sampai 20 teks yang tidak kosong
        and not jsonb_path_exists(audience, 'lax $[*] ? (!(@.values.type() == "array"))')
        and not jsonb_path_exists(audience, 'lax $[*] ? (@.values.size() < 1 || @.values.size() > 20)')
        and not jsonb_path_exists(audience, 'strict $[*].values[*] ? (@.type() != "string" || @ like_regex "^[[:space:]]*$")')
        -- jawaban @hotel adalah id hotel
        and not jsonb_path_exists(audience, 'strict $[*] ? (@.field == "@hotel" && exists (@.values[*] ? (!(@ like_regex "^[1-9][0-9]{0,17}$"))))')
        and pg_column_size(audience) <= 8192,
        false)
      else false
    end
  );

comment on column public.rundown_items.audience is
  'Siapa yang melihat baris ini (Agenda > Who sees it). Null = semua. [{"field": kunci pertanyaan pilihan atau "@hotel", "values": [jawaban...]}, ...] maksimal 3, semua harus cocok.';

notify pgrst, 'reload schema';

commit;
