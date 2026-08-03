-- ---------------------------------------------------------------------------
-- Zona waktu acara.
--
-- Sebelum ini seluruh tampilan waktu dipaku ke Asia/Jakarta (WIB), mengikuti
-- catatan non-functional di SPEC baris 762. Asumsi itu ditulis ketika lokasi
-- acara belum diketahui. Acara 2026 berlangsung di Bali, yang memakai WITA
-- (UTC+8), dan selisih satu jam itu bukan sekadar label:
--
--   * Penanda "sedang berlangsung" di /rundown membandingkan jam yang diketik
--     panitia dengan waktu sekarang. Dengan offset WIB, acara yang benar-benar
--     mulai 07:30 WITA baru ditandai berjalan pada 08:30 WITA — separuh acara
--     sudah lewat.
--   * Jam order, audit trail, dan Live Display tampil satu jam lebih awal
--     daripada struk EDC yang dipegang kasir, sehingga rekonsiliasi hari-H
--     membandingkan dua angka yang memang tidak akan cocok.
--
-- Kenapa satu kolom di event_settings, bukan per bagian rundown:
-- zona waktu adalah properti LOKASI acara, bukan properti satu tab jadwal. Kalau
-- disimpan per rundown, order dan jadwal bisa memakai zona berbeda dan tidak ada
-- yang menyadarinya sampai laporan tidak cocok. event_settings sudah menjadi
-- tempat setelan yang berlaku seluruh acara (pickup_mode, auto-void), jadi ia
-- tempat yang benar.
--
-- Kenapa daftar tertutup lewat CHECK, bukan text bebas:
-- ketiga zona ini menutup seluruh Indonesia dan tidak satu pun menerapkan DST.
-- Itu yang membuat aplikasi boleh memakai offset tetap (+07:00/+08:00/+09:00)
-- tanpa library timezone. Zona ber-DST yang lolos masuk akan membuat perhitungan
-- itu salah dua kali setahun, dan constraint ini menutup jalannya di database —
-- bukan hanya di form admin.
--
-- Default 'Asia/Jakarta' menjaga perilaku yang sudah tayang: baris singleton yang
-- ada tetap WIB sampai admin mengubahnya sendiri.
-- ---------------------------------------------------------------------------
alter table public.event_settings
  add column if not exists time_zone text not null default 'Asia/Jakarta';

-- Ditulis idempoten supaya migrasi aman dijalankan ulang pada database yang
-- constraint-nya sudah ada.
alter table public.event_settings
  drop constraint if exists event_settings_time_zone_allowed;

alter table public.event_settings
  add constraint event_settings_time_zone_allowed
  check (time_zone in ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'));

comment on column public.event_settings.time_zone is
  'Zona waktu lokasi acara. Dipakai SEMUA tampilan jam (order, audit, Live Display, denah, rundown) dan penanda "sedang berlangsung" di /rundown. Dibatasi tiga zona Indonesia karena aplikasi memakai offset tetap; ketiganya tanpa DST.';
