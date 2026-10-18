-- ============================================================================
-- Untuk siapa sebuah bagian Agenda (Agenda > This section > Who it's for).
-- Temuan U-01 langkah 2 / E-01 audit area peserta KSO, disetujui Hanung
-- 2026-10-18.
--
-- Satu kolom jsonb di rundown_sections:
--
--   null                                     semua peserta (bawaan)
--   {"field": "batch", "values": ["Batch 2"]} peserta yang jawabannya di kolom
--                                            peserta `batch` salah satu nilai itu
--
-- `field` adalah kunci pertanyaan form (participants.extra), termasuk kolom
-- khusus staf dari #201. Portal Horizon memakainya untuk membuka bagian milik
-- peserta lebih dulu dan menyebut kelompoknya ("Batch 2 · Bus 3"); bagian lain
-- tetap bisa dibuka. Halaman acara publik tidak membacanya.
--
-- Hanya menambah satu kolom tanpa default (null) dan satu CHECK bentuk pada
-- tabel kecil. Tidak ada data yang diubah: setiap bagian tetap untuk semua
-- peserta, jadi setiap acara berubah 0 px. Hak akses tabel yang sudah ada
-- berlaku untuk kolom baru. Satu transaksi, aman dijalankan ulang.
--
-- Aman sebelum atau sesudah kodenya tayang: portal membaca kolom ini dengan
-- kueri sendiri yang kembali kosong bila kolomnya belum ada, dan menyimpan
-- sasaran sebelum migrasi ini dijawab 409 AUDIENCE_NOT_READY.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.rundown_sections
  add column if not exists audience jsonb;

alter table public.rundown_sections drop constraint if exists rundown_sections_audience_check;
alter table public.rundown_sections
  add constraint rundown_sections_audience_check
  check (
    audience is null
    or (
      jsonb_typeof(audience) = 'object'
      and jsonb_typeof(audience -> 'field') = 'string'
      and (audience ->> 'field') ~ '^[a-z0-9_]{1,64}$'
      and jsonb_typeof(audience -> 'values') = 'array'
      and jsonb_array_length(audience -> 'values') between 1 and 20
      and pg_column_size(audience) <= 4096
    )
  );

comment on column public.rundown_sections.audience is
  'Untuk siapa bagian ini (Agenda > Who it''s for). Null = semua peserta. {"field": kunci pertanyaan form, "values": [jawaban...]}.';

notify pgrst, 'reload schema';

commit;
