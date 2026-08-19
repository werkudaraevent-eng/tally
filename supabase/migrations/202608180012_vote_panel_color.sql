-- ============================================================================
-- Warna panel layar voting.
--
-- Bar hasil sebelumnya digambar langsung di atas latar halaman. Pada latar
-- bergradien atau bergambar, jalur bar yang tembus pandang kehilangan batas
-- kirinya dan panjang isian jadi sulit dinilai dari kursi belakang — mata butuh
-- bidang pembanding, bukan sekadar dua warna yang berdekatan.
--
-- NULL berarti "hitung dari warna latar": panel digelapkan bila latarnya terang
-- dan diterangkan bila latarnya gelap. Diisi berarti panitia memilih sendiri.
-- Perbedaan itu perlu dipertahankan — nilai bawaan yang diketik ke kolom tidak
-- akan ikut berubah bila rumusnya kelak diperbaiki.
-- ============================================================================

alter table public.vote_settings
  add column if not exists panel_color text;

comment on column public.vote_settings.panel_color is
  'Warna bidang di belakang daftar hasil. NULL = dihitung otomatis dari background_color.';
