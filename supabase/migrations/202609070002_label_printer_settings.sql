-- ---------------------------------------------------------------------------
-- Label peserta: setelan printer dan susunan isinya, per acara.
--
-- Tamu walk-in adalah satu-satunya orang di ruangan yang TIDAK punya badge.
-- Peserta terdaftar sudah menerima kode QR-nya lewat email berhari-hari
-- sebelumnya; yang baru didaftarkan di meja hanya punya deretan angka di layar
-- ponsel petugas, dan angka itu harus ikut tamunya ke booth, undian, dan
-- voting sampai acara selesai.
--
-- ---- Kenapa SELURUHNYA setelan, tidak satu pun angka di dalam kode ---------
--
-- Protokol NIIMBOT tidak pernah diterbitkan vendornya. Pustaka yang dipakai
-- (niimbot-web-bluetooth, MIT) menguji tujuh model di hardware sungguhan, dan
-- B21 BUKAN salah satunya — ia diperkirakan sekeluarga dengan B1 (perintah
-- "b1", 203 dpi) tetapi belum pernah dibuktikan.
--
-- Yang menyelamatkan keadaan itu adalah perilaku drivernya: bila id model yang
-- dijawab printer tidak dikenalinya, ia TIDAK menolak, melainkan memakai
-- parameter yang diberikan pemanggil. Artinya satu-satunya yang memisahkan
-- "gagal" dari "jalan" adalah apakah parameter itu bisa dibetulkan tanpa
-- menyentuh kode — lebar kepala cetak, kerapatan panas, jenis label, awalan
-- nama Bluetooth. Ditulis di dalam kode, setiap pembetulan menjadi rilis baru
-- yang dikerjakan orang lain, dan pembetulan itu dibutuhkan pada saat printer
-- pertama kali dinyalakan di ruangan yang sudah berisi tamu.
--
-- ---- Kenapa satu baris per acara, bukan daftar template ---------------------
--
-- Pola yang sama dengan display_settings. Satu acara memakai satu rupa label,
-- dan tabel berisi banyak template menuntut kolom "mana yang dipakai" beserta
-- seluruh layar untuk mengaturnya — sebelum ada satu pun acara yang meminta
-- rupa label kedua.
--
-- ---- Kenapa "printer mana" TIDAK ada di sini -------------------------------
--
-- Pemasangan Bluetooth adalah milik PERANGKAT: izinnya dipegang peramban di
-- ponsel itu, dan printernya tergeletak di meja itu. Lima meja registrasi
-- berarti lima printer, dan acara yang sama bisa punya satu meja yang punya
-- printer dan empat yang tidak. Karena itu "ponsel ini mencetak" disimpan di
-- localStorage perangkatnya, sejajar dengan pilihan jalur di layar pemindai.
-- Yang disimpan di sini hanya hal yang sama untuk semua meja: rupa labelnya dan
-- parameter model printernya.
-- ---------------------------------------------------------------------------

create table if not exists public.label_settings (
  event_id uuid primary key references public.events(id) on delete cascade,

  -- Mati secara bawaan. Menyalakannya berarti layar pemindai mulai menawarkan
  -- pemasangan printer kepada petugas, dan acara yang tidak punya printer tidak
  -- boleh diberi tombol yang tidak akan pernah berhasil ditekan.
  enabled boolean not null default false,

  -- ---- Profil printer (dikirim apa adanya ke driver) ----------------------
  -- Awalan nama Bluetooth untuk menyaring daftar perangkat di dialog peramban.
  -- Tanpa penyaring, petugas memilih dari seluruh perangkat BLE di ballroom.
  name_prefixes text[] not null default array['B21', 'B1'],
  -- 'b1' = B1/B21/D11/D110 (protokol 3, 203 dpi). 'v4' = B1 Pro/B21 Pro (300 dpi).
  task text not null default 'b1' check (task in ('b1', 'v4')),
  dpi int not null default 203 check (dpi between 100 and 600),
  -- Panas kepala cetak. Skala yang sama dengan aplikasi resmi NIIMBOT.
  density smallint not null default 3 check (density between 1 and 5),
  -- Jenis gulungan: 1 = celah (label terpisah), nilai lain untuk kertas menerus
  -- dan tanda hitam. Angkanya milik protokol, bukan milik aplikasi ini.
  label_type smallint not null default 1 check (label_type between 1 and 5),
  speed smallint not null default 1 check (speed between 1 and 5),

  -- ---- Geometri label -----------------------------------------------------
  -- Piksel, bukan milimeter, karena inilah yang dikirim ke printer sebagai
  -- ukuran halaman. Milimeter disimpan terpisah hanya untuk keterangan di layar
  -- admin: 50 mm pada kepala cetak 203 dpi TIDAK selalu 400 px — sebagian model
  -- punya kepala yang lebih sempit daripada labelnya, dan kolom di luar kepala
  -- dibuang printer tanpa satu pun galat.
  width_px int not null default 384 check (width_px between 32 and 1200),
  height_px int not null default 240 check (height_px between 32 and 2000),
  -- Geser cetak sepanjang arah kertas. Positif menurunkan. Setiap model salah
  -- ke arahnya sendiri; angka bawaan ini diukur pada B1.
  offset_y_px int not null default 4 check (offset_y_px between -200 and 200),
  width_mm numeric(6,2) not null default 50 check (width_mm > 0),
  height_mm numeric(6,2) not null default 30 check (height_mm > 0),

  -- Susunan isi label. Berversi ('v') supaya penambahan jenis elemen kelak
  -- tidak membuat baris lama tidak terbaca. Lihat src/lib/label/layout.ts.
  layout jsonb not null default '{
    "v": 1,
    "elements": [
      { "type": "text", "field": "name",    "x": 8,   "y": 12,  "w": 368, "size": 34, "weight": "bold",   "align": "center" },
      { "type": "text", "field": "company", "x": 8,   "y": 58,  "w": 368, "size": 20, "weight": "normal", "align": "center" },
      { "type": "qr",   "field": "qr_code", "x": 142, "y": 86,  "size": 100 },
      { "type": "text", "field": "qr_code", "x": 8,   "y": 194, "w": 368, "size": 26, "weight": "bold",   "align": "center" }
    ]
  }'::jsonb,

  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

alter table public.label_settings enable row level security;
-- Tanpa policy: seluruh akses lewat service role di route handler, pola yang
-- sama dengan tabel setelan lain di aplikasi ini.

comment on table public.label_settings is
  'Setelan printer label dan rupa label peserta, satu baris per acara. Pemasangan Bluetooth disimpan di perangkat, bukan di sini.';
