-- ============================================================================
-- Animasi undian baru: panah tancap (P9).
--
-- Nama-nama melayang di layar sebagai kertas undian, lalu sebuah anak panah
-- melesat dan menancap pada salah satunya. Kertas yang tertancap itulah
-- pemenangnya.
--
-- Ditambahkan ke CHECK, bukan CHECK-nya yang dihapus. Daftar tertutup inilah
-- yang menjamin `undian_prizes.animation` selalu punya komponen yang
-- merendernya: nilai asing membuat layar panggung jatuh ke cabang terakhir dan
-- menampilkan "Mengundi..." selamanya, dan itu baru ketahuan di depan penonton.
--
-- Seperti animasi lain, pilihan ini murni TAMPILAN. Pemenang sudah ditentukan
-- dan ditulis server pada aksi `draw`; panahnya hanya menunjuk hasil yang sudah
-- ada, dan tidak ada satu pun jalur kode di layar yang bisa mengubahnya.
-- ============================================================================

alter table public.undian_prizes
  drop constraint if exists undian_prizes_animation_check;
alter table public.undian_prizes
  add constraint undian_prizes_animation_check check (
    animation in ('wheel', 'slot', 'cards', 'digits', 'dart', 'instant')
  );
