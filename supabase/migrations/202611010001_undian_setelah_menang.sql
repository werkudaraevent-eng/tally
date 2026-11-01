-- ============================================================================
-- Tulisan di layar panggung setelah pemenang keluar, per hadiah (Lucky draw >
-- Prizes & rules > prize > Stage screen). Diminta Hanung 2026-11-01 untuk KSO:
-- hadiah kecil diambil di meja panitia, hadiah besar pemenangnya maju ke
-- panggung. Selama ini layar tidak menulis apa pun setelah nama keluar.
--
-- Dua kolom di undian_prizes:
--
--   after_win   'none' (bawaan, layar seperti sekarang), 'stage' (maju ke
--               panggung) atau 'desk' (ambil di meja panitia).
--   stage_note  teks pengganti kalimat bawaannya. Null = kalimat bawaan.
--               Teks biasa, 1..120 karakter sesudah trim.
--
-- Satu kolom di undian_settings (Lucky draw > Stage display), diminta Hanung
-- 2026-11-01 di utas yang sama:
--
--   show_lineup  daftar hadiah sesuai urutan undi di layar tunggu, sebelum dan
--                di antara undian. Bawaan false: sebagian klien tidak mau
--                hadiahnya terlihat sejak awal.
--
-- Hanya menambah kolom dengan default 'none', null dan false. Tidak ada data yang
-- diubah: setiap acara berubah 0 px sampai panitia memilih sendiri. Hak akses
-- tabel yang sudah ada (service_role saja) berlaku untuk kolom baru. Duplikat
-- acara ikut menyalinnya (duplicate_event menyalin baris lewat to_jsonb).
-- Satu transaksi, aman dijalankan ulang.
--
-- Jalankan SEBELUM kodenya tayang: daftar kolom hadiah menyebut kedua kolom.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.undian_prizes
  add column if not exists after_win text not null default 'none',
  add column if not exists stage_note text;

alter table public.undian_prizes drop constraint if exists undian_prizes_after_win_check;
alter table public.undian_prizes
  add constraint undian_prizes_after_win_check
  check (after_win in ('none', 'stage', 'desk'));

alter table public.undian_prizes drop constraint if exists undian_prizes_stage_note_check;
alter table public.undian_prizes
  add constraint undian_prizes_stage_note_check
  check (stage_note is null or char_length(btrim(stage_note)) between 1 and 120);

alter table public.undian_settings
  add column if not exists show_lineup boolean not null default false;

comment on column public.undian_settings.show_lineup is
  'Tampilkan daftar hadiah (urutan undi) di layar tunggu panggung. Bawaan false.';

comment on column public.undian_prizes.after_win is
  'Tulisan di layar panggung setelah pemenang keluar: none, stage (maju ke panggung), desk (ambil di meja panitia).';
comment on column public.undian_prizes.stage_note is
  'Teks pengganti kalimat bawaan after_win di layar panggung. Null = kalimat bawaan.';

commit;

notify pgrst, 'reload schema';
