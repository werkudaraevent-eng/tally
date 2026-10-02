-- Teks English untuk baris rundown di halaman acara /en. Kosong = halaman
-- English memakai teks Indonesia. Aditif saja: tidak ada data yang diubah.
-- Sudah dijalankan di produksi 2026-10-02 (nama migrasi rundown_items_english_text).
alter table public.rundown_items
  add column if not exists title_en text,
  add column if not exists subtitle_en text;

comment on column public.rundown_items.title_en is 'Judul versi English untuk halaman acara /en. NULL = pakai title.';
comment on column public.rundown_items.subtitle_en is 'Keterangan versi English untuk halaman acara /en. NULL = pakai subtitle.';
