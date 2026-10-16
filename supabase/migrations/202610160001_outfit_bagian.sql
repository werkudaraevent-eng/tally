-- ============================================================================
-- Outfit (dress code) per bagian Agenda, untuk portal peserta Gathering Horizon.
--
-- Satu bagian rundown = satu hari (atau satu batch). Outfit menempel di bagian
-- itu, jadi ikut berpindah bila tanggal atau urutan bagiannya dibetulkan.
-- Paling banyak tiga isian per bagian, tiap isian:
--   { when?: teks <= 40, what: teks 1..120, note?: teks <= 200, photo_url?: URL https }
-- Bentuk tiap isian divalidasi di /api/admin/rundown/sections/outfit (zod);
-- database hanya menjaga bentuk luarnya: array, paling banyak tiga.
--
-- Hanya menambah satu kolom berdefault, jadi aman dijalankan sebelum kode baru
-- tayang dan sebaliknya: kode membaca kolom ini lewat kueri terpisah yang
-- kembali kosong bila kolomnya belum ada.
--
-- duplicate_event (202608070016) menyalin baris lewat
-- jsonb_populate_record(..., to_jsonb(baris) || ...), bukan daftar kolom, jadi
-- kolom ini ikut tersalin tanpa perubahan di fungsi itu.
-- ============================================================================

alter table public.rundown_sections
  add column if not exists outfit jsonb not null default '[]'::jsonb;

alter table public.rundown_sections drop constraint if exists rundown_sections_outfit_check;
-- CASE, bukan AND: Postgres tidak menjamin urutan AND, dan jsonb_array_length
-- pada nilai bukan array melempar galat alih-alih menolak barisnya.
alter table public.rundown_sections
  add constraint rundown_sections_outfit_check
  check (case when jsonb_typeof(outfit) = 'array' then jsonb_array_length(outfit) <= 3 else false end);

notify pgrst, 'reload schema';
