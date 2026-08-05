-- ---------------------------------------------------------------------------
-- Warna kursi pada denah, dapat diatur dari CMS.
--
-- Masalah: kursi terisi berwarna PUTIH, dan itu bukan pilihan desain melainkan
-- efek samping. `seat-map-view.tsx` tidak punya warna kursi sendiri; ia meminjam
-- warna lain:
--
--   kursi kosong  -> background_color  (warna latar denah)
--   kursi terisi  -> text_color        (warna TEKS, kebetulan #ffffff)
--
-- Akibatnya klien yang ingin mengubah warna kursi terisi tidak punya jalan:
-- mengubah `text_color` ikut mengubah nomor meja, label panggung, dan judul.
-- Warna kursi yang sudah check-in bahkan tidak dapat diubah sama sekali karena
-- ditulis langsung di komponen sebagai '#237a52'.
--
-- Empat kolom, bukan dua. Kursi punya empat keadaan, dan permintaan awal hanya
-- menyebut dua ("terisi" dan "tersedia"). Menambah dua kolom saja meninggalkan
-- hijau check-in tetap terkunci di kode, dan itu pasti jadi permintaan
-- berikutnya. Warna sorotan hasil pencarian sengaja TIDAK ditambahkan: ia sudah
-- memakai `accent_color` yang memang berarti "warna penekanan layar ini".
--
-- Semua NULLABLE dengan arti "ikuti perilaku lama":
--
--   seat_available_color  null -> background_color   (seperti sekarang)
--   seat_occupied_color   null -> text_color         (seperti sekarang)
--   seat_checked_in_color null -> #237a52            (seperti sekarang)
--   seat_outline_color    null -> text_color         (seperti sekarang)
--
-- Dengan begitu denah yang sudah ditata panitia tidak berubah satu piksel pun
-- sampai ada yang benar-benar mengisinya. Idiom yang sama dipakai `title_color`
-- dan `subtitle_color` pada tabel ini: NULL berarti "ikut tema", bukan "tanpa
-- warna".
--
-- `seat_outline_color` ikut disertakan karena kursi KOSONG hanya dibedakan oleh
-- garis tepinya. Bila admin memilih warna terisi yang gelap tanpa dapat mengatur
-- garis, kursi kosong dan terisi akan tampak sama di atas latar gelap — kegagalan
-- yang justru lahir dari fitur ini sendiri.
--
-- Per AGENDA, bukan global, mengikuti `background_color` yang juga per agenda.
-- Warna kursi yang terbaca di atas biru tua meeting pagi bisa hilang sama sekali
-- di atas latar gala malam.
-- ---------------------------------------------------------------------------

alter table public.seat_map_sessions
  add column if not exists seat_available_color text,
  add column if not exists seat_occupied_color text,
  add column if not exists seat_checked_in_color text,
  add column if not exists seat_outline_color text;

comment on column public.seat_map_sessions.seat_available_color is
  'Isian kursi kosong. NULL berarti mengikuti background_color (perilaku sebelum kolom ini ada).';
comment on column public.seat_map_sessions.seat_occupied_color is
  'Isian kursi terisi. NULL berarti mengikuti text_color (perilaku sebelum kolom ini ada).';
comment on column public.seat_map_sessions.seat_checked_in_color is
  'Isian kursi yang tamunya sudah check-in. NULL berarti #237a52 (perilaku sebelum kolom ini ada). Hanya dipakai saat tampilan kehadiran aktif.';
comment on column public.seat_map_sessions.seat_outline_color is
  'Garis tepi kursi. NULL berarti mengikuti text_color. Kursi kosong hanya dibedakan oleh garis ini.';

-- Format hex enam digit ditegakkan di database, bukan hanya di route handler.
-- Nilai seperti "biru" atau "#fff" akan diterima diam-diam oleh SVG lalu
-- diabaikan, sehingga kursi kembali ke warna bawaan tanpa ada yang tahu kenapa.
do $$
declare
  col text;
begin
  foreach col in array array[
    'seat_available_color', 'seat_occupied_color', 'seat_checked_in_color', 'seat_outline_color'
  ] loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.seat_map_sessions'::regclass
        and conname = 'seat_map_sessions_' || col || '_hex'
    ) then
      execute format(
        'alter table public.seat_map_sessions add constraint %I check (%I is null or %I ~ ''^#[0-9a-fA-F]{6}$'')',
        'seat_map_sessions_' || col || '_hex', col, col
      );
    end if;
  end loop;
end $$;
