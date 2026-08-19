-- ============================================================================
-- Mode berhenti manual untuk animasi undian (P8).
--
-- Sampai sekarang durasi putaran ditetapkan di CMS (`spin_seconds`) dan layar
-- panggung berhenti sendiri. Itu cocok untuk acara yang rundown-nya rapat, tapi
-- tidak untuk momen yang justru ingin diregangkan MC: "kita tahan dulu ya...
-- siapa yaaa..." Dengan durasi tetap, roda berhenti di tengah kalimat MC.
--
-- Yang perlu diubah ternyata hanya SATU nilai, bukan mesin undiannya:
--
--   - Pemenang sudah ditentukan dan DITULIS ke `undian_winners` pada aksi
--     `draw`, sebelum animasi mulai. Animasinya kosmetik.
--   - Aksi `reveal` sudah ada dan sudah berarti "berhenti sekarang".
--   - `/api/undian/state` sudah menghitung `revealDue` dengan penjaga
--     `reveal_at !== null`, jadi nilai NULL berarti "belum waktunya, tidak akan
--     pernah otomatis".
--   - Ticker animasi memakai `endsAt ? sisa : 3000`, sehingga tanpa waktu
--     berhenti ia berputar pada kecepatan tetap tanpa batas.
--
-- Jadi mode manual = jangan isi `reveal_at` saat draw. Kolom di bawah hanya
-- menyimpan pilihan panitia per hadiah.
--
-- Per hadiah, bukan per event: hadiah hiburan di awal acara biasanya dikejar
-- waktu, sementara hadiah utama di penghujung acara justru ingin ditahan. Satu
-- setelan untuk seluruh event memaksa panitia memilih salah satu.
--
-- Konsekuensi yang disengaja: pada mode manual, undian yang tidak dihentikan
-- akan berputar selamanya. Itu tidak menghilangkan apa pun -- pemenangnya sudah
-- tersimpan sejak `draw` -- dan operator mana pun bisa menekan Berhenti dari
-- halaman kontrol, termasuk setelah peramban sebelumnya tertutup.
-- ============================================================================

alter table public.undian_prizes
  add column if not exists spin_mode text not null default 'timed';

alter table public.undian_prizes
  drop constraint if exists undian_prizes_spin_mode_check;
alter table public.undian_prizes
  add constraint undian_prizes_spin_mode_check check (spin_mode in ('timed', 'manual'));

comment on column public.undian_prizes.spin_mode is
  'timed = berhenti sendiri setelah spin_seconds. manual = berputar sampai operator menekan Berhenti; reveal_at dibiarkan NULL saat draw.';

-- `spin_seconds` TIDAK dijadikan nullable meski tak terpakai pada mode manual.
-- Nilainya tetap tersimpan supaya hadiah yang dikembalikan ke mode waktu tidak
-- kehilangan durasi yang sudah disetel panitia, dan supaya kolomnya tidak perlu
-- diberi penjaga baru "wajib diisi kecuali kalau".
