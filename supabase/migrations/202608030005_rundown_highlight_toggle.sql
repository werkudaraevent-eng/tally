-- ---------------------------------------------------------------------------
-- Sakelar penanda "sedang berlangsung" per bagian rundown.
--
-- Kenapa per bagian dan bukan satu setelan global:
-- penanda hanya benar selama hari acara bagian itu. Rundown gala malam yang
-- sudah disusun jauh hari akan menampilkan "berikutnya" pada butir pertamanya
-- setiap kali dibuka, padahal acaranya masih pekan depan. Dengan sakelar per
-- bagian, panitia menyalakannya pada bagian yang sedang berjalan saja, dan
-- bagian lain tetap tampil sebagai jadwal biasa.
--
-- Default `true` karena itu perilaku yang sudah tayang; mengubah default menjadi
-- false akan mematikan penanda pada bagian yang sudah disetel panitia.
-- ---------------------------------------------------------------------------
alter table public.rundown_sections
  add column if not exists highlight_current boolean not null default true;

comment on column public.rundown_sections.highlight_current is
  'Menyalakan penanda "sedang berlangsung"/"berikutnya" dan auto-scroll di halaman publik. Dimatikan untuk bagian yang tanggalnya belum tiba, agar tidak menandai acara yang belum berjalan.';
