-- ============================================================================
-- Undian: animasi baru 'cahaya' (Cahaya HP, "Phone lights"), diminta Hanung
-- 2026-11-07.
--
--   animation 'cahaya'  HP peserta yang membuka Area peserta ikut menyala dan
--                       berganti warna serentak, lalu padam per gelombang
--                       sampai tinggal HP pemenang yang emas. Layar panggung
--                       menampilkan satu titik per orang di kolam.
--
-- Hanya daftar animasi yang boleh disimpan yang bertambah: tidak ada kolom,
-- data, atau hadiah yang berubah. Jadwal gelombang dan kunci per undian
-- disimpan di kolom jsonb undian_state.pending yang sudah ada. Satu transaksi,
-- aman dijalankan ulang.
--
-- Jalankan SEBELUM kodenya tayang: tanpa ini, menyimpan hadiah dengan Phone
-- lights ditolak database (23514).
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.undian_prizes drop constraint if exists undian_prizes_animation_check;
alter table public.undian_prizes
  add constraint undian_prizes_animation_check check (
    animation in ('wheel', 'slot', 'cards', 'digits', 'dart', 'wall', 'tunnel', 'drum', 'arena', 'cahaya', 'instant')
  );

commit;

notify pgrst, 'reload schema';
