-- ============================================================================
-- Undian: dua animasi baru, diminta Hanung 2026-11-05.
--
--   animation 'tunnel'        Terowongan nama: nama pemenang masuk dari ujung
--                             terowongan dan berhenti di depan.
--   animation 'drum'          Tabung bola lotre 3D: bola ditiup udara, lalu
--                             satu bola per pemenang jatuh lewat pintu di dasar.
--   undian_prizes.anim_speed  'slow' | 'normal' (bawaan) | 'fast': kecepatan
--                             gerak kedua animasi itu selama mengundi.
--
-- Batas pemenang per undi (terowongan 10, tabung 6) dijaga di API, bukan di
-- database: hadiah lain tetap boleh sampai 50.
--
-- Default 'normal' dan daftar animasi yang hanya bertambah: setiap hadiah tetap
-- seperti sekarang. Duplikat acara ikut menyalinnya (duplicate_event lewat
-- to_jsonb). Satu transaksi, aman dijalankan ulang.
--
-- Jalankan SEBELUM kodenya tayang: daftar hadiah dan layar panggung membaca
-- kolom anim_speed, dan tanpa kolom itu keduanya gagal dimuat.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.undian_prizes drop constraint if exists undian_prizes_animation_check;
alter table public.undian_prizes
  add constraint undian_prizes_animation_check check (
    animation in ('wheel', 'slot', 'cards', 'digits', 'dart', 'wall', 'tunnel', 'drum', 'instant')
  );

alter table public.undian_prizes
  add column if not exists anim_speed text not null default 'normal';

alter table public.undian_prizes drop constraint if exists undian_prizes_anim_speed_check;
alter table public.undian_prizes
  add constraint undian_prizes_anim_speed_check
  check (anim_speed in ('slow', 'normal', 'fast'));

comment on column public.undian_prizes.anim_speed is
  'Animasi Terowongan nama dan Tabung bola: kecepatan gerak selama mengundi (slow, normal, fast). Bawaan normal.';

commit;

notify pgrst, 'reload schema';
