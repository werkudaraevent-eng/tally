# Rencana Logistik Peserta: kamar, bus, dan merchandise (PLAN, belum diimplementasikan)

Status: **DRAFT**, menunggu keputusan di bagian "Pertanyaan terbuka".
Tujuan: peserta melihat di area peserta (`/e/<slug>/peserta`) nomor kamar dan
teman sekamarnya, bus yang ia naiki, dan ukuran baju yang ia pilih. Panitia
mengisi semuanya lewat impor Excel atau CMS, per acara.

Desain layar: Figma "Tally, Halaman acara PRIMA 2026", halaman "Area peserta
(member)".

SQL di dokumen ini adalah draf untuk ditinjau, **bukan** file migrasi.
Migrasinya dibuat terpisah setelah keputusan di bawah diambil.

---

## Keadaan sekarang

- Kursi sudah ada: `participants.seats` (jsonb `[{subEventId, subEventName, label}]`),
  diisi sinkron Scanner. Prima: 207 dari 278 peserta punya kursi. **Tidak
  dimodelkan ulang.**
- Ukuran baju sudah *bisa* ditanyakan lewat pembuat formulir pendaftaran:
  jawaban field kustom tersimpan di `participants.extra` (kode impor menyebut
  "ukuran kaus" sebagai contoh). Prima: `extra` kosong untuk semua peserta.
- Kamar, teman sekamar, dan bus belum ada sama sekali.
- Konvensi yang diikuti (dari migrasi yang ada):
  - `event_id uuid not null references events(id) on delete cascade` di setiap tabel.
  - FK komposit `(event_id, participant_id) references participants(event_id, id)`
    supaya baris anak tidak bisa menunjuk peserta acara lain
    (`202608070002`, `vote_ballots`).
  - Tabel konfigurasi memakai `id bigint generated always as identity`.
  - RLS aktif, `revoke all ... from public, anon, authenticated`, tanpa
    policy. Semua akses lewat service role. RPC `security definer` +
    `grant execute ... to service_role`.
  - `updated_at` / `updated_by` diisi aplikasi atau RPC, tanpa trigger.
  - Tulis ke `audit_logs` dari route atau RPC.
  - Kunci acara selesai otomatis lewat `requireRequestEvent` (409
    `EVENT_NOT_WRITABLE`).

---

## Keputusan desain

### 1. Kamar: hotel → kamar → penempatan

Teman sekamar **tidak disimpan**, melainkan diturunkan: siapa pun yang
ditempatkan di kamar yang sama. Menyimpannya dua kali (A sekamar B, B sekamar
A) pasti suatu saat tidak cocok, dan peserta akan melihat nama yang salah.

Kapasitas kamar dijaga di database (RPC dengan kunci baris), bukan di
formulir: dua admin yang mengisi bersamaan tidak boleh menaruh tiga orang di
kamar twin.

Satu peserta satu kamar per acara. Tanggal check-in/out ada di kamar sebagai
bawaan, dan bisa ditimpa per peserta (tamu yang datang sehari lebih lambat).

### 2. Bus: perjalanan → kendaraan → penempatan per perjalanan

Satu acara bisa punya beberapa perjalanan (berangkat pagi, ke Awards, pulang
malam), dan peserta tidak selalu di bus yang sama untuk semuanya. Penempatan
per perjalanan menangani kasus itu; CMS menyediakan "pakai bus yang sama untuk
semua perjalanan" supaya kasus umum tetap satu klik.

Kendaraan (Bus 1, Bus 2, ...) didefinisikan sekali per acara lalu dipakai di
semua perjalanan, dengan kapasitas yang dijaga per perjalanan.

### 3. Merchandise: item → pilihan ukuran per peserta

Tidak memakai `participants.extra`. Alasannya:

- Panitia butuh **rekap per ukuran** untuk vendor. Menghitung dari jsonb
  bebas rapuh, dan label pilihan bisa berubah setelah ada jawaban.
- Butuh **batas waktu ubah** yang ditegakkan server, dan status **sudah
  diambil** di meja registrasi (scan QR → tandai diambil).
- Satu acara bisa punya lebih dari satu item (kemeja, jaket, kaus).

Pilihan dari formulir pendaftaran tetap bisa dipakai: item merchandise bisa
ditautkan ke key field formulir, dan jawaban pendaftaran disalin jadi
pilihan awal.

### 4. Privasi teman sekamar

Peserta hanya melihat **nama dan perusahaan** teman sekamarnya, tidak email
atau telepon. Bisa dimatikan per acara (`member.show_roommates`); untuk acara
yang sensitif panitia cukup menampilkan nomor kamar.

### 5. Yang boleh mengubah apa

| Data | Panitia (admin) | Peserta |
|---|---|---|
| Hotel, kamar, penempatan kamar | ya | tidak, lihat saja |
| Kendaraan, perjalanan, penempatan bus | ya | tidak, lihat saja |
| Item merchandise dan ukurannya | ya | tidak |
| Pilihan ukuran | ya, kapan saja sebelum acara ditutup | ya, sampai `edit_deadline` item dan selama belum diambil |
| Tandai sudah diambil | admin dan scanner (meja registrasi) | tidak |

---

## Skema (draf)

```
events 1─* lodging_hotels 1─* lodging_rooms 1─* lodging_assignments *─1 participants
events 1─* transport_vehicles ─┐
events 1─* transport_trips 1─* transport_assignments *─1 participants
                                └──────────────┘ (vehicle_id)
events 1─* merch_items 1─* merch_selections *─1 participants
```

```sql
-- ---------------------------------------------------------------- Kamar
create table if not exists public.lodging_hotels (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  address text,
  map_url text,
  -- Bawaan untuk kamar-kamarnya; bisa ditimpa per kamar dan per peserta.
  check_in_at timestamptz,
  check_out_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lodging_hotels_event_id_unique unique (event_id, id)
);

create table if not exists public.lodging_rooms (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  hotel_id bigint not null,
  -- Teks, bukan angka: "1208", "1208A", "Villa 3".
  room_number text not null,
  room_type text,                                  -- bebas: twin, double, suite
  capacity smallint not null default 2 check (capacity between 1 and 20),
  floor text,
  check_in_at timestamptz,
  check_out_at timestamptz,
  notes text,                                      -- hanya untuk panitia
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lodging_rooms_event_id_unique unique (event_id, id),
  constraint lodging_rooms_number_unique unique (event_id, hotel_id, room_number),
  foreign key (event_id, hotel_id) references public.lodging_hotels(event_id, id) on delete cascade
);

create table if not exists public.lodging_assignments (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  room_id bigint not null,
  participant_id uuid not null,
  -- Null = pakai tanggal kamar/hotel.
  check_in_at timestamptz,
  check_out_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  -- Satu kamar per peserta per acara.
  constraint lodging_assignments_participant_unique unique (event_id, participant_id),
  foreign key (event_id, room_id) references public.lodging_rooms(event_id, id) on delete cascade,
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete cascade
);
create index if not exists lodging_assignments_room_idx on public.lodging_assignments (room_id);

-- ---------------------------------------------------------------- Bus
create table if not exists public.transport_vehicles (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,                              -- "Bus 3"
  capacity smallint check (capacity between 1 and 200),
  plate_number text,
  crew_contact text,                               -- hanya untuk panitia
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint transport_vehicles_event_id_unique unique (event_id, id),
  constraint transport_vehicles_code_unique unique (event_id, code)
);

create table if not exists public.transport_trips (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,                              -- "Berangkat ke venue"
  depart_at timestamptz not null,
  origin text not null,                            -- "Lobi hotel"
  destination text not null,
  meeting_point text,                              -- titik kumpul, tampil ke peserta
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint transport_trips_event_id_unique unique (event_id, id)
);

create table if not exists public.transport_assignments (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  trip_id bigint not null,
  vehicle_id bigint not null,
  participant_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  -- Satu kendaraan per peserta per perjalanan.
  constraint transport_assignments_unique unique (trip_id, participant_id),
  foreign key (event_id, trip_id) references public.transport_trips(event_id, id) on delete cascade,
  foreign key (event_id, vehicle_id) references public.transport_vehicles(event_id, id) on delete cascade,
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete cascade
);
create index if not exists transport_assignments_participant_idx on public.transport_assignments (event_id, participant_id);
create index if not exists transport_assignments_trip_vehicle_idx on public.transport_assignments (trip_id, vehicle_id);

-- ---------------------------------------------------------------- Merchandise
create table if not exists public.merch_items (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,                              -- "Kemeja batik PRIMA 2026"
  -- Urutan tampil = urutan array. Minimal satu ukuran.
  sizes text[] not null check (cardinality(sizes) between 1 and 12),
  size_guide text,                                 -- teks atau URL tabel ukuran vendor
  pickup_note text,                                -- "Ambil di meja registrasi"
  -- Peserta boleh mengubah sampai waktu ini. Null = tidak boleh sama sekali.
  edit_deadline timestamptz,
  -- Key field formulir pendaftaran yang jawabannya disalin jadi pilihan awal.
  registration_field_key text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merch_items_event_id_unique unique (event_id, id)
);

create table if not exists public.merch_selections (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  item_id bigint not null,
  participant_id uuid not null,
  size text not null,
  source text not null check (source in ('registrasi', 'peserta', 'panitia', 'impor')),
  selected_at timestamptz not null default now(),
  picked_up_at timestamptz,
  picked_up_by uuid references public.users(id) on delete set null,
  constraint merch_selections_unique unique (item_id, participant_id),
  foreign key (event_id, item_id) references public.merch_items(event_id, id) on delete cascade,
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete cascade
);
-- `size` harus salah satu `merch_items.sizes`: dijaga di RPC simpan, karena
-- check constraint tidak bisa membaca tabel lain.

-- ---------------------------------------------------------------- Akses
-- Sama seperti tabel lain: tanpa policy, hanya service role.
alter table public.lodging_hotels enable row level security;
revoke all on table public.lodging_hotels from public, anon, authenticated;
-- (ulangi untuk ketujuh tabel)
```

### RPC

| RPC | Guna | Penjaga |
|---|---|---|
| `assign_room(p_event_id, p_room_id, p_participant_id, p_actor)` | Tempatkan atau pindahkan peserta | `select ... for update` pada kamar; tolak `ROOM_FULL` bila penghuni ≥ `capacity`; audit `lodging_assigned` |
| `assign_vehicle(p_event_id, p_trip_id, p_vehicle_id, p_participant_ids uuid[], p_actor)` | Tempatkan banyak peserta sekaligus | kapasitas per (perjalanan, kendaraan); audit `transport_assigned` |
| `save_merch_selection(p_event_id, p_item_id, p_participant_id, p_size, p_source, p_actor)` | Simpan ukuran | ukuran ada di `sizes`; peserta hanya sebelum `edit_deadline` dan bila `picked_up_at is null` |
| `import_logistics(p_event_id, p_rows jsonb, p_dry_run, p_actor)` | Impor Excel | pola `import_participants`: dry run dan terapkan satu jalur, cocokkan lewat `qr_code`, isu dibatasi 50 |
| `member_logistics(p_event_id, p_participant_id)` | Satu panggilan untuk area peserta | kembalikan jsonb: kamar (+ nama dan perusahaan teman sekamar bila diizinkan), perjalanan dan bus, pilihan merchandise |

Semua `security definer set search_path = public`, execute hanya
`service_role`.

---

## Alur panitia

Menu admin baru **Logistik** (di grup Peserta), halaman supporting-pane
dengan tab **Kamar**, **Transportasi**, **Merchandise**:

- **Kamar:** daftar hotel dan kamarnya, penghuni per kamar, penanda kamar
  penuh/kosong, peserta yang belum dapat kamar. Seret atau pilih peserta ke
  kamar.
- **Transportasi:** perjalanan (baris) × kendaraan (kolom) dengan jumlah
  terisi/kapasitas; pilih banyak peserta lalu "Tempatkan di Bus 3", opsi
  "untuk semua perjalanan".
- **Merchandise:** item dan ukurannya, rekap jumlah per ukuran (untuk vendor,
  bisa diekspor), batas waktu ubah, daftar yang belum memilih.
- **Impor Excel satu lembar**, satu baris per peserta, pakai parser
  `src/lib/participants-io.ts` dan pratinjau dry run seperti impor peserta:

  | qr_code | hotel | kamar | tipe_kamar | kapasitas | bus_berangkat | bus_pulang | ukuran_kemeja |
  |---|---|---|---|---|---|---|---|

  Hotel, kamar, dan kendaraan yang belum ada dibuat otomatis saat impor
  (ditampilkan di pratinjau sebagai "akan dibuat"), supaya panitia tidak
  harus mengisi master data dulu.
- **Meja registrasi:** layar pemindai menampilkan ukuran baju peserta dan
  tombol "Tandai sudah diambil".

## Alur peserta

`/e/<slug>/peserta` memanggil `member_logistics` sekali dan menampilkan
kartu Kamar, Bus, Tempat duduk (dari `seats` yang sudah ada), dan Ukuran
baju, masing-masing hanya bila datanya ada dan bagiannya dinyalakan di CMS
(`member.show_lodging`, `show_transport`, `show_merch`, `show_roommates`).
Profil menampilkan pilihan ukuran yang bisa diubah sampai batas waktunya.

## Integrasi yang tidak boleh terlupa

- **`delete_event`** (`202608180001`): ketujuh tabel `on delete cascade` ke
  events, tetapi FK komposit ke `participants` juga cascade, jadi tidak ada
  jalur `set null` yang memicu 23502. Tetap diuji di migrasi.
- **`duplicate_event`** (`202608070016`): salin konfigurasi (hotel, kamar,
  kendaraan, perjalanan dengan tanggal digeser, item merchandise), **jangan**
  salin penempatan dan pilihan, sama seperti peserta tidak disalin.
- **Kunci acara selesai:** route admin memakai `requireRequestEvent`, jadi
  terkunci otomatis. RPC `save_merch_selection` dari peserta memeriksa status
  acara sendiri, karena jalur peserta tidak lewat `requireRequestEvent`.
- **Peserta dihapus di sumber** (`source_removed_at`): penempatannya tetap
  ada untuk audit, tetapi tidak dihitung ke kapasitas dan tidak muncul
  sebagai teman sekamar.

---

## Pertanyaan terbuka (perlu keputusan)

1. **Pasangan sekamar berdasarkan jenis kelamin?** `participants` tidak punya
   kolom jenis kelamin. Bila perlu peringatan "kamar campuran", butuh kolom
   baru atau field formulir.
2. **Teman sekamar tampil ke peserta secara bawaan, atau harus dinyalakan?**
   Rekomendasi: bawaan menyala untuk nama dan perusahaan saja.
3. **Ukuran baju dipilih saat pendaftaran, di area peserta, atau keduanya?**
   Rekomendasi: keduanya, dengan batas waktu.
4. **Satu bus untuk semua perjalanan cukup untuk acara-acara ke depan?** Bila
   ya, `transport_trips` bisa dibuang dan penempatan langsung ke kendaraan
   (lebih sederhana, satu tabel lebih sedikit).
5. **Siapa yang menandai merchandise sudah diambil:** petugas scanner di meja
   registrasi, atau hanya admin?

## Tahapan

1. Migrasi tujuh tabel + RPC, `delete_event` dan `duplicate_event`
   diperbarui. Uji di database lokal/cabang sebelum produksi.
2. Impor Excel + halaman admin Logistik (tab Kamar dulu).
3. Area peserta: kartu Kamar, Bus, Tempat duduk, Ukuran baju.
4. Transportasi dan Merchandise di admin, penanda "sudah diambil" di pemindai.
