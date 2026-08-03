-- ---------------------------------------------------------------------------
-- CMS header dan footer untuk dua layar publik: /denah dan /display.
--
-- Sebelum ini panitia sudah bisa mengatur judul, sub judul, tiga warna, dan
-- gambar latar. Yang belum ada justru bagian yang paling sering diminta berubah
-- menjelang acara: LOGO di atas dan BLOK SPONSOR di bawah. Keduanya sekarang
-- hanya bisa hadir dengan cara dibakar ke dalam gambar latar, sehingga ganti
-- satu logo media partner berarti mengekspor ulang seluruh artwork.
--
-- Kenapa satu gambar footer, bukan daftar logo satu per satu:
-- blok sponsor punya aturan tata letak yang tidak bisa ditebak sistem — jarak
-- antar logo, ukuran optis yang tidak sama dengan ukuran kotaknya (logo
-- bertuliskan panjang harus lebih lebar dari logo berbentuk lingkaran), dan
-- urutan yang sudah disepakati kontrak. Menyusunnya otomatis dari daftar URL
-- akan menghasilkan barisan yang secara teknis benar tapi terlihat salah, dan
-- panitia tidak punya cara memperbaikinya. Satu PNG gabungan yang sudah ditata
-- desainer selalu menang untuk kasus ini.
--
-- SEMUA kolom di sini boleh kosong dan skalanya default 1.00. Ini disengaja:
-- setelah migrasi dijalankan, kedua layar tampil PERSIS seperti sebelumnya.
-- Tidak ada acara yang sedang berjalan berubah tampilannya diam-diam; header
-- dan footer baru muncul hanya setelah admin sengaja mengunggahnya.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Pilihan jenis huruf dibatasi daftar tertutup, bukan input teks bebas.
--
-- Alasannya operasional, bukan selera. Font di layar ini di-self-host lewat
-- next/font supaya tidak ada permintaan ke server luar saat acara berlangsung.
-- LED di lokasi sering berada di jaringan yang buruk atau tertutup, dan font
-- yang gagal diambil di tengah acara berarti layar jatuh ke fallback yang tidak
-- pernah diuji — persis pada saat tidak ada yang bisa memperbaikinya. Daftar
-- tertutup juga menjamin setiap pilihan sudah dicek keterbacaannya dari jauh.
--
-- Nilai di sini adalah kunci, bukan nama font. Pemetaan kunci ke font asli ada
-- di aplikasi (src/lib/branding.ts), sehingga menukar font di belakang kunci
-- tidak memerlukan migrasi data.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'branding_font') then
    create type public.branding_font as enum (
      'sans',       -- Geist. Bawaan aplikasi.
      'geometric',  -- Montserrat. Paling dekat dengan key visual acara ini.
      'condensed',  -- Oswald. Untuk judul panjang di panel sempit.
      'grotesk',    -- Space Grotesk.
      'serif',      -- Playfair Display.
      'mono'        -- Geist Mono.
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Kolom bersama. Sengaja dinamai identik di kedua tabel supaya satu modul
-- normalisasi dan satu komponen render bisa melayani keduanya. Kalau namanya
-- berbeda, setiap penambahan field kelak harus dikerjakan dua kali dengan dua
-- bentuk data, dan begitu satu terlewat kedua layar di ruangan yang sama tampil
-- dengan aturan berbeda.
-- ---------------------------------------------------------------------------

-- /denah — per agenda, karena meeting pagi dan gala malam bisa punya logo dan
-- sponsor yang tidak sama.
alter table public.seat_map_sessions
  add column if not exists logo_url text,
  add column if not exists logo_scale numeric(3,2) not null default 1.00,
  add column if not exists footer_image_url text,
  add column if not exists footer_image_scale numeric(3,2) not null default 1.00,
  add column if not exists footer_text text,
  add column if not exists heading_font public.branding_font not null default 'sans',
  add column if not exists title_scale numeric(3,2) not null default 1.00,
  add column if not exists subtitle_scale numeric(3,2) not null default 1.00,
  add column if not exists footer_scale numeric(3,2) not null default 1.00,
  add column if not exists title_color text,
  add column if not exists subtitle_color text,
  add column if not exists footer_text_color text;

-- /display — satu baris untuk seluruh acara, mengikuti bentuk tabel yang sudah ada.
alter table public.display_settings
  add column if not exists logo_url text,
  add column if not exists logo_scale numeric(3,2) not null default 1.00,
  add column if not exists footer_image_url text,
  add column if not exists footer_image_scale numeric(3,2) not null default 1.00,
  add column if not exists footer_text text,
  add column if not exists heading_font public.branding_font not null default 'sans',
  add column if not exists title_scale numeric(3,2) not null default 1.00,
  add column if not exists subtitle_scale numeric(3,2) not null default 1.00,
  add column if not exists footer_scale numeric(3,2) not null default 1.00,
  add column if not exists title_color text,
  add column if not exists subtitle_color text,
  add column if not exists footer_text_color text;

-- ---------------------------------------------------------------------------
-- Batas skala 0.50-2.00.
--
-- Skala dipakai sebagai PENGALI terhadap rumus clamp() yang sudah ada di kedua
-- layar, bukan sebagai ukuran piksel absolut. Ini pilihan yang menentukan:
-- seluruh tampilan LED sengaja tidak punya satu pun ukuran piksel tetap supaya
-- tata letaknya menyesuaikan diri dari panel 256x768 sampai 1080x1920 tanpa
-- disetel ulang saat pemasangan. Kalau admin diberi field "ukuran font dalam px",
-- angka yang pas di monitor kantornya akan mepet di panel sempit dan mungil di
-- LED besar — dan itu baru terlihat setelah layar terpasang di dinding.
--
-- Dengan pengali, admin tetap mendapat kendali "lebih besar / lebih kecil",
-- sementara sifat responsifnya tetap utuh. Batas 2.00 di atas mencegah satu
-- elemen membesar sampai mendorong isi lain keluar dari pandangan.
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
  col text;
begin
  foreach tbl in array array['seat_map_sessions', 'display_settings'] loop
    foreach col in array array['logo_scale', 'footer_image_scale', 'title_scale', 'subtitle_scale', 'footer_scale'] loop
      execute format('alter table public.%I drop constraint if exists %I', tbl, tbl || '_' || col || '_range');
      execute format(
        'alter table public.%I add constraint %I check (%I between 0.50 and 2.00)',
        tbl, tbl || '_' || col || '_range', col
      );
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Warna per elemen tetap wajib hex, TAPI boleh null.
--
-- Null bukan berarti "tidak ada warna", melainkan "ikut warna dasar layar"
-- (text_color untuk judul dan footer, accent_color untuk sub judul). Dibedakan
-- begitu supaya panitia yang cuma ingin mengganti satu warna aksen tidak
-- terpaksa mengisi ulang seluruh warna elemen, dan supaya perubahan warna dasar
-- kelak tetap menurun ke elemen yang belum pernah disetel khusus.
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
  col text;
begin
  foreach tbl in array array['seat_map_sessions', 'display_settings'] loop
    foreach col in array array['title_color', 'subtitle_color', 'footer_text_color'] loop
      execute format('alter table public.%I drop constraint if exists %I', tbl, tbl || '_' || col || '_hex');
      execute format(
        'alter table public.%I add constraint %I check (%I is null or %I ~ ''^#[0-9a-fA-F]{6}$'')',
        tbl, tbl || '_' || col || '_hex', col, col
      );
    end loop;
  end loop;
end $$;

comment on column public.seat_map_sessions.logo_url is
  'Logo di atas judul. Null berarti tidak ada logo dan header tampil seperti sebelum fitur ini ada.';
comment on column public.seat_map_sessions.footer_image_url is
  'Satu gambar gabungan untuk blok sponsor/media partner, sudah ditata desainer. Null berarti footer hanya berisi ringkasan meja seperti sebelumnya.';
comment on column public.seat_map_sessions.heading_font is
  'Kunci jenis huruf judul. Dipetakan ke font yang di-self-host di src/lib/branding.ts, bukan nama font langsung.';
comment on column public.seat_map_sessions.title_scale is
  'Pengali terhadap rumus clamp() ukuran judul. 1.00 berarti sama dengan ukuran bawaan yang sudah teruji di semua resolusi LED.';

comment on column public.display_settings.logo_url is
  'Logo di header Live Display. Null berarti header tampil seperti sebelum fitur ini ada.';
comment on column public.display_settings.footer_image_url is
  'Satu gambar gabungan untuk blok sponsor/media partner. Null berarti footer hanya berisi ticker seperti sebelumnya.';
