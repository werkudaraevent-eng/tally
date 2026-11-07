-- ============================================================================
-- Undian: animasi baru 'arena' (Arena Gugur), diminta Hanung 2026-11-07.
--
--   animation 'arena'   Kerumunan seluruh kolam berdiri di arena 3D. Tiap
--                       babak sebagian lantai runtuh bersama orang di atasnya,
--                       sampai tinggal pemenang di podium emas.
--
-- Hanya daftar animasi yang boleh disimpan yang bertambah: tidak ada kolom,
-- data, atau hadiah yang berubah. Batas 20 pemenang per undi dijaga di API,
-- bukan di database. Satu transaksi, aman dijalankan ulang.
--
-- Jalankan SEBELUM kodenya tayang: tanpa ini, menyimpan hadiah dengan Arena
-- Gugur ditolak database.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.undian_prizes drop constraint if exists undian_prizes_animation_check;
alter table public.undian_prizes
  add constraint undian_prizes_animation_check check (
    animation in ('wheel', 'slot', 'cards', 'digits', 'dart', 'wall', 'tunnel', 'drum', 'arena', 'instant')
  );

commit;

notify pgrst, 'reload schema';
