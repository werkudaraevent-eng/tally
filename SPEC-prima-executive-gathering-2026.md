# SPEC — Booth Transaction & Leaderboard System
## PRIMA Executive Gathering 2026

**Tanggal event:** 5 Agustus 2026
**Target:** aplikasi web (PWA) yang dipakai di HP/tablet panitia selama event berlangsung.

---

## 1. Konteks & Tujuan

Event memiliki **6 booth**. Setiap booth menjual barang, dan setiap booth punya **1 item diskon seharga Rp 1**. Setiap peserta hanya boleh membeli **maksimal 1 item diskon per booth** (maksimal 6 item diskon total, dari 6 booth berbeda).

Pembayaran **tidak terintegrasi** dengan sistem ini. Pembayaran dilakukan manual di **satu kasir terpusat** yang melayani semua booth, umumnya lewat mesin EDC. Sistem ini berfungsi sebagai **buku catatan digital**, bukan POS. Metode pembayaran yang tersedia di kasir dikelola admin lewat Settings (BR-10a).

Sistem harus:
1. Mencegah peserta mengambil item diskon lebih dari 1 kali di booth yang sama.
2. Mencatat total belanja tiap peserta.
3. Menampilkan **leaderboard top spender secara live** di layar proyektor.
4. Menghasilkan data rekonsiliasi di akhir acara.

Setiap peserta sudah memiliki **badge fisik dengan QR code unik**. QR ini adalah identitas tunggal peserta di sistem.

---

## 2. Aktor & Aplikasi

| Aktor | Jumlah device | Aplikasi | Fungsi |
|---|---|---|---|
| Admin Booth | 6 (1 per booth) | App Booth | Scan QR, buat order, serahkan barang |
| Kasir | 1–2 | App Kasir | Scan QR, tandai lunas, void |
| Panitia/Admin | 1 | Dashboard Admin | Monitoring, override, export |
| — | 1 (proyektor) | Live Display | Leaderboard, read-only, auto-refresh |

Semua aplikasi berada dalam **satu codebase**, dibedakan oleh route dan role pada akun login.

---

## 3. Aturan Bisnis (WAJIB)

**BR-01** — Satu peserta hanya boleh memiliki **1 order dengan item diskon per booth**. Aturan ini ditegakkan dengan **unique constraint di level database**, bukan hanya validasi di aplikasi.

**BR-02** — Order yang berstatus `void` tidak dihitung dalam BR-01. Artinya jika order dibatalkan, kuota item diskon peserta di booth tersebut kembali tersedia.

**BR-03** — Item diskon harganya **selalu Rp 1** dan tidak dapat diubah oleh admin booth.

**BR-04** — Leaderboard **hanya menghitung order berstatus `paid` atau `handed_over`**. Order `pending` tidak masuk hitungan.

**BR-05** — Nilai Rp 1 dari item diskon **tidak dihitung** ke total leaderboard. Leaderboard hanya menjumlahkan nilai item reguler. (Alasan: kalau dihitung, 6 item diskon hanya bernilai Rp 6 dan tidak berpengaruh — lebih baik dikeluarkan agar angka bersih.)

**BR-06** — Order `pending` yang belum dibayar dalam **45 menit** otomatis berubah menjadi `void` (cron/scheduled job setiap 5 menit). Kuota diskon peserta kembali tersedia.

**BR-07** — Hanya **kasir** yang boleh mengubah status ke `paid` atau `void`. Admin booth **tidak boleh**.

**BR-08** — Order tidak bisa diubah menjadi `void` jika statusnya sudah `handed_over`, kecuali oleh role Admin dengan alasan wajib diisi.

**BR-09** — Nomor order **diambil dari stiker fisik pre-printed** (format `B{booth}-{3 digit}`, contoh `B3-014`). Admin booth mengetik nomor dari stiker, sistem **tidak** meng-generate nomor sendiri. Sistem menolak nomor yang sudah terpakai.

**BR-10** — Nomor referensi pembayaran **wajib diisi** sebelum tombol "Tandai Lunas" aktif, jika metode yang dipilih menandai `requires_reference = true`. Jumlah digit mengikuti `reference_digits` milik metode tersebut (EDC = 6). Metode tanpa referensi (mis. tunai) langsung mengaktifkan tombol.

**BR-10a** — Metode pembayaran **dikelola dari halaman Settings**, bukan hardcode. Admin dapat menyalakan/mematikan metode dan menambah metode baru (mis. QRIS) beserta aturan referensinya. Aturan yang dijaga sistem:
- **Minimal satu metode harus aktif.** Ditegakkan di API dan constraint trigger database; kasir tidak boleh kehabisan opsi pembayaran di tengah acara.
- Metode yang **sudah dipakai order tidak dapat dihapus**, hanya dinonaktifkan, agar laporan tetap utuh (FK `on delete restrict`).
- Metode bawaan (`edc`, `cash`) tidak dapat dihapus, hanya dinonaktifkan.
- Kasir memuat ulang daftar metode tiap 30 detik, sehingga metode yang baru dimatikan hilang dari layar tanpa perlu reload.

**BR-14** — Konfirmasi kasir dapat dimatikan lewat setting `cashier_confirmation_required`:
- `true` (**default**) — alur asli. Order booth berstatus `pending`, masuk antrean kasir, dan baru masuk hitungan top spender setelah kasir menandai lunas.
- `false` — order booth **langsung final saat dibuat** (`handed_over` bila `pickup_mode = immediate`, `paid` bila `after_payment`), dengan `auto_settled = true`. Nilainya langsung masuk top spender tanpa kasir.

Konsekuensi yang disengaja saat `false`:
- `payment_method` dibiarkan **NULL**. Tidak ada kasir yang memilih metode, dan mengisi nilai palsu akan mengotori rekonsiliasi EDC.
- Tidak ada verifikasi pihak kedua atas pembayaran. Ini keputusan bisnis, bukan celah teknis.
- **Booth boleh mem-void order buatannya sendiri** dengan alasan wajib, dibatasi pada order `auto_settled` milik `booth_id`-nya. Tanpa ini booth tidak punya jalan koreksi apa pun untuk salah input, karena `pickup_mode = immediate` membuat order langsung `handed_over` yang dilindungi BR-08. Order alur kasir tetap mengikuti BR-08.
- Order `pending` yang masih menggantung di antrean kasir **ikut ditandai lunas** saat toggle dimatikan. Tanpa ini order tersebut tidak ada yang melayani dan akan kena auto-void (BR-06).

**BR-14a** — Nilai toggle **disnapshot di `orders.auto_settled` saat order dibuat**, pola sama dengan BR-12. Status order tidak pernah ditentukan ulang oleh leaderboard: leaderboard tetap menghitung `paid`/`handed_over` saja (BR-04). Membuat leaderboard ikut menghitung `pending` akan bertabrakan dengan auto-void sehingga angka top spender naik lalu turun sendiri.

**BR-11** — Mode penyerahan barang dikendalikan oleh setting `pickup_mode`, dapat diubah kapan saja lewat halaman Settings:
- `after_payment` (**default**) — barang disimpan di booth, peserta bayar ke kasir, lalu kembali ke booth untuk mengambil. Order melewati status `handed_over`.
- `immediate` — barang langsung diserahkan saat order dibuat. Order otomatis berstatus `handed_over` bersamaan dengan `paid` (yaitu saat kasir menandai lunas), dan langkah serah-terima di booth dilewati.

**BR-12** — Nilai `pickup_mode` **disimpan sebagai snapshot di kolom `orders.pickup_mode` saat order dibuat**. Jika setting diubah di tengah acara, order lama tetap mengikuti mode saat dibuat. Ini mencegah barang yang sudah terlanjur disimpan di booth menjadi "hilang" dari alur pengambilan.

**BR-13** — Tampilan nama peserta di Live Display dikendalikan oleh setting `name_display_mode`:
- `full` (**default**) — `Budi Santoso — PT Maju Jaya`
- `initials` — `B. S. — PT Maju Jaya`
- `company_only` — `PT Maju Jaya`
- `hidden` — `Peserta #14` (hanya peringkat dan nominal)

Setting ini berlaku **seketika** tanpa perlu restart Live Display, dan tidak mengubah data tersimpan — nama lengkap tetap utuh di database dan di export CSV.

**BR-14** — Peserta dapat menolak namanya ditampilkan secara individual lewat kolom `participants.allow_name_display = false`. Jika bernilai false, peserta tersebut **selalu** ditampilkan sebagai `initials`, berapa pun nilai setting global. Setting global tidak dapat menimpa penolakan individual.

---

## 4. State Machine Order

```
                  ┌──────────┐
   booth create → │ pending  │
                  └────┬─────┘
                       │ kasir konfirmasi bayar
                       ▼
                  ┌──────────┐
                  │   paid   │
                  └────┬─────┘
                       │ booth serahkan barang
                       ▼
                  ┌──────────────┐
                  │ handed_over  │
                  └──────────────┘

  pending ──(45 menit / kasir batalkan)──▶ void
  paid    ──(kasir batalkan, EDC gagal)──▶ void
  handed_over ──(admin only + alasan)────▶ void
```

Jika `pickup_mode = 'immediate'`, transisi `paid → handed_over` terjadi **otomatis dalam transaksi yang sama** saat kasir menandai lunas. `handed_over_by` diisi dengan user kasir, dan tidak ada aksi manual di booth.

---

## 5. Data Model

Gunakan PostgreSQL. Skema minimal:

```sql
-- Peserta (di-import dari CSV sebelum event)
CREATE TABLE participants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code       text UNIQUE NOT NULL,     -- isi QR di badge
  name          text NOT NULL,
  company       text,
  title         text,
  photo_url     text,
  allow_name_display boolean NOT NULL DEFAULT true,  -- false = selalu inisial (BR-14)
  created_at    timestamptz DEFAULT now()
);

-- Booth (seed 6 baris)
CREATE TABLE booths (
  id                  int PRIMARY KEY,          -- 1..6
  name                text NOT NULL,
  code                text UNIQUE NOT NULL,     -- 'B1'..'B6'
  discount_item_name  text NOT NULL,
  discount_item_price int NOT NULL DEFAULT 1,
  discount_item_stock int,                      -- nullable = unlimited
  is_active           boolean DEFAULT true
);

-- Order
CREATE TYPE order_status AS ENUM ('pending','paid','void','handed_over');
CREATE TYPE pickup_mode AS ENUM ('after_payment','immediate');

-- Metode pembayaran adalah DATA, bukan enum: admin mengelolanya dari Settings
-- (BR-10a). Enum lama dihapus di migrasi 202607290004.
CREATE TABLE payment_methods (
  code               text PRIMARY KEY,          -- 'edc', 'cash', 'qris'
  label              text NOT NULL,             -- nama tampilan di kasir
  requires_reference boolean NOT NULL DEFAULT false,
  reference_label    text,                      -- mis. 'Approval code EDC'
  reference_digits   int,                       -- jumlah digit yang divalidasi
  is_active          boolean NOT NULL DEFAULT true,
  sort_order         int NOT NULL DEFAULT 100,
  is_builtin         boolean NOT NULL DEFAULT false
);

CREATE TABLE orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text UNIQUE NOT NULL,        -- dari stiker fisik, 'B3-014'
  participant_id   uuid NOT NULL REFERENCES participants(id),
  booth_id         int  NOT NULL REFERENCES booths(id),
  has_discount_item boolean NOT NULL DEFAULT false,
  regular_amount   int NOT NULL DEFAULT 0,      -- rupiah, item reguler
  total_amount     int NOT NULL,                -- regular_amount + (has_discount_item ? 1 : 0)
  status           order_status NOT NULL DEFAULT 'pending',
  pickup_mode      pickup_mode NOT NULL,        -- snapshot saat order dibuat (BR-12)
  auto_settled     boolean NOT NULL DEFAULT false, -- lunas tanpa kasir (BR-14a)
  note             text,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz DEFAULT now(),
  -- pembayaran
  payment_method   text REFERENCES payment_methods(code),
  approval_code    text,                        -- nomor referensi, mis. 6 digit struk EDC
  paid_at          timestamptz,
  paid_by          uuid REFERENCES users(id),
  -- penyerahan
  handed_over_at   timestamptz,
  handed_over_by   uuid REFERENCES users(id),
  -- pembatalan
  void_reason      text,
  voided_at        timestamptz,
  voided_by        uuid REFERENCES users(id)
);

-- INI YANG MENEGAKKAN BR-01. Jangan hanya andalkan validasi di aplikasi.
CREATE UNIQUE INDEX uniq_discount_per_booth
  ON orders (participant_id, booth_id)
  WHERE has_discount_item = true AND status <> 'void';

CREATE INDEX idx_orders_participant ON orders (participant_id);
CREATE INDEX idx_orders_status ON orders (status);

-- User panitia
CREATE TYPE user_role AS ENUM ('booth','cashier','admin');

CREATE TABLE users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username   text UNIQUE NOT NULL,
  pin_hash   text NOT NULL,               -- login pakai PIN 6 digit, bukan password
  role       user_role NOT NULL,
  booth_id   int REFERENCES booths(id),   -- wajib jika role = 'booth'
  is_active  boolean DEFAULT true
);

-- Setting event (singleton, selalu hanya 1 baris dengan id = 1)
CREATE TYPE name_display_mode AS ENUM ('full','initials','company_only','hidden');

CREATE TABLE event_settings (
  id                       int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pickup_mode              pickup_mode NOT NULL DEFAULT 'after_payment',
  name_display_mode        name_display_mode NOT NULL DEFAULT 'full',
  leaderboard_enabled      boolean NOT NULL DEFAULT true,
  pending_auto_void_minutes int NOT NULL DEFAULT 45,
  cashier_confirmation_required boolean NOT NULL DEFAULT true, -- BR-14
  updated_at               timestamptz DEFAULT now(),
  updated_by               uuid REFERENCES users(id)
);

INSERT INTO event_settings (id) VALUES (1);

-- Audit log
CREATE TABLE audit_logs (
  id         bigserial PRIMARY KEY,
  order_id   uuid REFERENCES orders(id),
  user_id    uuid REFERENCES users(id),
  action     text NOT NULL,              -- 'create','pay','void','hand_over'
  payload    jsonb,
  created_at timestamptz DEFAULT now()
);
```

**Catatan penting untuk implementasi:** ketika insert order gagal karena `uniq_discount_per_booth`, tangkap error kode Postgres `23505` dan kembalikan pesan yang ramah: *"Peserta sudah mengambil item diskon di booth ini."* Jangan tampilkan error database mentah ke admin booth.

---

## 6. API Endpoints

Semua endpoint memerlukan autentikasi (session/JWT). Role dicek di server, bukan hanya di UI.

### Booth
```
GET  /api/participants/by-qr?qr={qr_code}
     → { participant, discount_available: bool, discount_taken_at, 
         existing_orders_at_this_booth[], progress: { visited: 3, total: 6 } }

POST /api/orders
     body: { order_code, participant_id, has_discount_item, regular_amount, note }
     → 201 { order } | 409 { error: "DISCOUNT_ALREADY_TAKEN" } 
                     | 409 { error: "ORDER_CODE_USED" }

POST /api/orders/{id}/hand-over
     → { order }   // hanya jika status = 'paid'
```

### Kasir
```
GET  /api/participants/{id}/pending-orders
     → { participant, orders[], grand_total }

POST /api/orders/settle
     body: { order_ids[], payment_method, approval_code }
     → { settled_orders[], total }

POST /api/orders/{id}/void        // role booth, cashier, admin
     body: { reason }
     → { order }
     // booth dibatasi: hanya order auto_settled milik booth_id-nya (BR-14).
     // cashier: pending/paid. admin: termasuk handed_over (BR-08).
```

### Live / Admin
```
GET  /api/leaderboard?limit=10
     → { updated_at, entries: [{ rank, display_name, company, total_spent, booth_count }] }

GET  /api/leaderboard/explorer?limit=10
     → peserta dengan jumlah booth terbanyak (6/6 duluan menang)

GET  /api/activity-feed?limit=20
     → transaksi terbaru untuk ticker

GET  /api/admin/stats
     → { total_revenue, total_orders, pending_count, orders_per_booth[], 
         discount_items_claimed_per_booth[] }

GET  /api/admin/export.csv
```

### Settings
```
GET  /api/settings
     → { pickup_mode, name_display_mode, leaderboard_enabled, 
         pending_auto_void_minutes, cashier_confirmation_required, updated_at }
     // dapat diakses semua role — App Booth & Kasir butuh nilai ini
     // untuk menentukan alur yang ditampilkan

PATCH /api/settings                      // role admin saja
     body: { pickup_mode?, name_display_mode?, leaderboard_enabled?, 
             pending_auto_void_minutes?, cashier_confirmation_required? }
     → { settings, auto_settled_orders }
     // wajib tulis ke audit_logs: nilai lama → nilai baru + user
     // auto_settled_orders = jumlah order pending yang ikut dilunasi saat
     // cashier_confirmation_required diubah true → false (BR-14)
```

**Propagasi setting:** App Booth, App Kasir, dan Live Display harus memuat ulang `/api/settings` setiap **30 detik** (atau lewat realtime subscription). Setting yang diubah harus berlaku di semua device tanpa perlu logout atau reload manual. Simpan di context/store global, jangan panggil per-komponen.

Live Display boleh polling tiap 5 detik, atau pakai realtime subscription kalau memakai Supabase.

---

## 7. Spesifikasi Layar

### 7.1 App Booth

**Prinsip UI:** admin booth bekerja sambil mengobrol dengan tamu. Status harus terbaca dari jarak 1 meter tanpa membaca teks — **warna dulu, teks belakangan**.

**Layar 1 — Home**
- Header: nama booth + nama admin yang login
- Tombol **SCAN QR** memenuhi hampir seluruh layar (target sentuh besar)
- Statistik kecil di bawah: `Order hari ini: 23` · `Item diskon terklaim: 18`
- Tombol sekunder: "Cari peserta manual" (untuk badge rusak/QR tidak terbaca)

**Layar 2 — Scanner**
- Kamera fullscreen, kotak panduan di tengah
- Auto-submit saat QR terdeteksi, beri feedback getar + bunyi
- Tombol X untuk batal

**Layar 3 — Hasil Scan (layar paling penting)**

```
┌──────────────────────────────────┐
│  [foto]   BUDI SANTOSO           │
│           PT Maju Jaya           │
│           Direktur Operasional   │
├──────────────────────────────────┤
│                                  │
│   ✓  ITEM DISKON TERSEDIA        │   ← blok HIJAU, tinggi minimal 100px
│      Tas Kanvas — Rp 1           │
│                                  │
│      [ ✓ AMBIL ITEM DISKON ]     │   ← toggle, default OFF
│                                  │
├──────────────────────────────────┤
│  Item reguler (opsional)         │
│  Rp [ 250.000            ]       │   ← numpad, format ribuan otomatis
├──────────────────────────────────┤
│  Nomor stiker                    │
│  B3- [ 014 ]                     │   ← prefix booth otomatis, ketik 3 digit
├──────────────────────────────────┤
│  Progress peserta                │
│  ● ● ● ○ ○ ○     3 dari 6 booth  │
├──────────────────────────────────┤
│  TOTAL         Rp 250.001        │
│                                  │
│     [    BUAT ORDER    ]         │   ← disabled jika tidak ada input
└──────────────────────────────────┘
```

Jika item diskon **sudah pernah diambil di booth ini**, blok atas berubah menjadi:

```
│   ✕  SUDAH DIAMBIL 14:32         │   ← blok ABU GELAP
│      Order B3-014 · Lunas        │
│      [ tombol disabled ]         │
```

> Jangan sembunyikan blok ini — tampilkan dalam kondisi disabled beserta jam pengambilan, agar admin punya jawaban konkret jika peserta protes.

Jika peserta punya order **belum diserahkan** di booth ini, tampilkan kartu tambahan:

```
├──────────────────────────────────┤
│  📦 BARANG SIAP DIAMBIL          │
│  B3-014 · Tas Kanvas             │
│  ✓ LUNAS 14:47                   │   ← hijau
│  [   SERAHKAN BARANG   ]         │
└──────────────────────────────────┘
```
Jika status masih `pending`, tombol mati dan tertulis merah: **"BELUM LUNAS — arahkan peserta ke kasir"**.

> Kartu ini hanya muncul untuk order dengan `pickup_mode = 'after_payment'`. Order yang dibuat saat mode `immediate` tidak pernah menampilkan kartu ini karena barangnya sudah diserahkan di awal.

**Layar 4 — Sukses**
- Latar hijau penuh
- Nomor order **sangat besar** di tengah: `B3-014`
- Teks instruksi **mengikuti `pickup_mode`**:
  - `after_payment` → *"Tempel stiker pada barang, simpan di rak. Arahkan peserta ke kasir."*
  - `immediate` → *"Serahkan barang sekarang. Arahkan peserta ke kasir untuk membayar."*
- Auto kembali ke Home setelah 4 detik, atau tap untuk lanjut

**Indikator mode di header App Booth.** Tampilkan chip kecil permanen agar admin booth selalu tahu mode yang berlaku — ini mencegah kesalahan operasional saat setting diubah di tengah acara:

```
Booth 3 · Ratna          [ 📦 SIMPAN DI BOOTH ]     ← mode after_payment
Booth 3 · Ratna          [ 🤝 SERAHKAN LANGSUNG ]   ← mode immediate
```

Saat setting berubah, tampilkan toast di semua device booth: *"Mode penyerahan diubah menjadi: Serahkan Langsung"*.

---

### 7.2 App Kasir

Gunakan tablet atau layar lebih besar. Kasir mengetik ulang nominal ke EDC secara manual, jadi **angka total harus mustahil salah baca**.

**Layar 1 — Scan**
- Sama seperti booth, plus daftar "Transaksi terakhir" di bawah untuk koreksi cepat

**Layar 2 — Tagihan**

```
┌────────────────────────────────────────┐
│  BUDI SANTOSO — PT Maju Jaya           │
├────────────────────────────────────────┤
│  ☑ B1-007  Booth 1                     │
│      Item diskon + reguler   Rp 150.001│
│  ☑ B3-014  Booth 3                     │
│      Item diskon             Rp      1 │
│  ☑ B5-022  Booth 5                     │
│      Reguler                 Rp 500.000│
├────────────────────────────────────────┤
│                                        │
│   TOTAL   Rp 650.002                   │  ← font sangat besar
│   enam ratus lima puluh ribu dua rupiah│  ← terbilang, font kecil
│                                        │
├────────────────────────────────────────┤
│  Metode:  [ EDC ]  [ Tunai ]  [ ... ]  │  ← dari payment_methods aktif
│                                        │
│  Approval code EDC (6 digit)           │  ← label & digit dari metode
│  [ ______ ]                            │
├────────────────────────────────────────┤
│      [   TANDAI LUNAS   ]              │  ← disabled sampai approval terisi
│      [ Void order... ]                 │
└────────────────────────────────────────┘
```

Detail perilaku:
- Checkbox per order — peserta mungkin ingin membayar sebagian dulu. Total ikut berubah.
- Tombol metode dirender dari `payment_methods` yang `is_active`, bukan daftar tetap (BR-10a).
- Field referensi **wajib** jika metode menandai `requires_reference`. Untuk EDC ini memaksa kasir benar-benar sudah memegang struk, bukan asal tap. Label dan jumlah digit mengikuti konfigurasi metode.
- Jika metode tidak butuh referensi (mis. Tunai), field disembunyikan dan tombol langsung aktif.
- Jika tidak ada metode aktif, kasir melihat peringatan dan tombol lunas tetap mati.
- Tombol Void membuka modal dengan **alasan wajib diisi**.

**Layar 3 — Sukses**
- Hijau penuh, daftar nomor order yang baru dilunasi (besar)
- Teks: *"Tulis nomor order pada struk EDC, masukkan ke kotak."*

**Header persisten kasir:** `Transaksi: 47` · `Total: Rp 12.450.000`
Angka ini yang dicocokkan dengan settlement EDC di akhir acara.

---

### 7.3 Live Display (proyektor)

Read-only, tanpa interaksi, auto-refresh. Desain kontras tinggi, font besar, terbaca dari jarak jauh.

Layout:
- **Kiri (60%)** — Top 10 Spender: rank, nama, perusahaan, total. Animasi transisi saat urutan berubah (framer-motion `layout`).
- **Kanan atas (40%)** — Booth Explorer: peserta dengan booth terlengkap, tampilkan sebagai 6 titik terisi.
- **Kanan bawah** — Statistik: total transaksi, total item diskon terklaim.
- **Bawah, full width** — Ticker berjalan: *"Budi Santoso baru saja bertransaksi di Booth 3"*.

Refresh tiap 5 detik. Sediakan mode fullscreen (`?fullscreen=1`).

**Tampilan nama** mengikuti setting `name_display_mode` (BR-13) dan dihitung **di server**, bukan di client — Live Display tidak boleh menerima nama lengkap peserta yang sedang disembunyikan. Endpoint `/api/leaderboard` mengembalikan field `display_name` yang sudah diformat sesuai setting, dengan penolakan individual (BR-14) sudah diterapkan.

Perubahan setting harus terlihat di layar dalam **< 30 detik** tanpa refresh manual.

---

### 7.4 Dashboard Admin

- Statistik realtime: revenue, order per booth, item diskon terklaim per booth
- Tabel semua order dengan filter status/booth/peserta, dan pencarian
- Import peserta dari CSV
- CRUD booth (nama, item diskon, stok)
- CRUD user panitia
- Void order apa pun (termasuk `handed_over`) dengan alasan wajib
- **Export CSV** untuk rekonsiliasi: `order_code, waktu, booth, nama peserta, perusahaan, item diskon (Y/N), nominal reguler, total, status, metode bayar, approval code, kasir`
- Halaman "Order Pending" — daftar order yang belum dibayar, untuk dikejar sebelum acara selesai

### Halaman Settings (role admin saja)

```
┌──────────────────────────────────────────────────┐
│  PENYERAHAN BARANG                               │
│                                                  │
│  ( ) Serahkan langsung di booth                  │
│      Barang diberikan saat order dibuat.         │
│      Peserta tidak perlu kembali ke booth.       │
│                                                  │
│  (•) Ambil setelah lunas          ← default      │
│      Barang disimpan di booth. Peserta kembali   │
│      mengambil setelah membayar di kasir.        │
│                                                  │
│  ⚠ Order yang sudah dibuat tetap mengikuti mode  │
│    saat dibuat. Perubahan hanya berlaku untuk    │
│    order baru.                                   │
├──────────────────────────────────────────────────┤
│  NAMA DI LAYAR LEADERBOARD                       │
│                                                  │
│  (•) Nama lengkap      Budi Santoso — PT Maju    │
│  ( ) Inisial           B. S. — PT Maju Jaya      │
│  ( ) Perusahaan saja   PT Maju Jaya              │
│  ( ) Sembunyikan       Peserta #14               │
│                                                  │
│  Preview: [ Budi Santoso — PT Maju Jaya ]        │
│                                                  │
│  3 peserta menolak nama ditampilkan — mereka     │
│  selalu tampil sebagai inisial. [lihat daftar]   │
├──────────────────────────────────────────────────┤
│  LEADERBOARD                                     │
│  [ ✓ ] Tampilkan leaderboard di Live Display     │
│                                                  │
│  Auto-void order pending setelah                 │
│  [ 45 ] menit                                    │
├──────────────────────────────────────────────────┤
│           [    SIMPAN PERUBAHAN    ]             │
└──────────────────────────────────────────────────┘
```

Ketentuan:
- Perubahan `pickup_mode` memunculkan **dialog konfirmasi** yang menyebutkan jumlah order berstatus `paid` yang belum diambil, agar admin sadar konsekuensinya.
- Setiap perubahan tercatat di `audit_logs` (nilai lama → nilai baru, user, waktu).
- Preview nama diperbarui langsung saat pilihan diubah, sebelum disimpan.
- Toggle `leaderboard_enabled` berguna saat sesi presentasi — layar dialihkan tanpa mematikan sistem.

---

## 8. Tech Stack yang Disarankan

- **Next.js 14+ (App Router)** + TypeScript
- **Supabase** — Postgres, Auth, Realtime. Menghemat waktu setup.
- **Tailwind CSS** + shadcn/ui
- **QR scanner:** `html5-qrcode` atau `@zxing/browser` (browser-based, tidak perlu app native)
- **Animasi leaderboard:** framer-motion
- **PWA:** installable ke home screen, agar tidak terlihat seperti tab browser saat dipakai panitia

Jika waktu sangat mepet, `regular_amount` bisa dibuat sebagai satu field angka saja tanpa breakdown item — ini sudah cukup untuk semua kebutuhan sistem.

---

## 9. Edge Cases yang Harus Ditangani

| Kasus | Perilaku yang diharapkan |
|---|---|
| QR badge rusak / tidak terbaca | Tombol "Cari peserta manual" — search by nama/perusahaan |
| Peserta scan di 2 booth bersamaan | Constraint DB yang menolak, bukan validasi UI. Tampilkan pesan ramah. |
| Nomor stiker sudah dipakai | Tolak dengan pesan: *"Nomor B3-014 sudah terpakai. Gunakan stiker berikutnya."* |
| EDC gagal setelah ditandai lunas | Kasir void order, status kembali membolehkan pembayaran ulang |
| Nominal terlalu kecil, EDC menolak | Kasir pilih metode tanpa referensi, mis. Tunai |
| Admin mematikan metode saat kasir sedang memilihnya | Kasir memuat ulang tiap 30 detik; pilihan pindah otomatis ke metode aktif. Server menolak `PAYMENT_METHOD_INACTIVE` bila tetap dikirim |
| Internet mati | Tampilkan banner merah "OFFLINE — jangan buat order". Kuota diskon **wajib** divalidasi online. |
| Peserta minta refund | Void oleh admin dengan alasan, kuota diskon otomatis kembali |
| Order pending menumpuk di akhir acara | Halaman "Order Pending" di dashboard admin |
| Dua orang punya nama sama | Selalu tampilkan **foto + perusahaan**, jangan hanya nama |
| `pickup_mode` diubah saat ada barang tertahan di booth | Order lama tetap pakai mode lamanya (snapshot). Dialog konfirmasi menyebutkan jumlahnya. |
| Device booth belum sinkron setting terbaru | Validasi mode dilakukan **di server** saat submit. Jika berbeda, server yang menang. |

---

## 10. Non-Functional

- **Autentikasi:** login PIN 6 digit, bukan password panjang. Panitia mengetik di HP sambil berdiri.
- **Session:** jangan auto-logout selama event (durasi minimal 12 jam).
- **Role enforcement di server.** Admin booth tidak boleh bisa memanggil endpoint kasir walaupun tahu URL-nya.
- **Semua nominal disimpan sebagai integer rupiah.** Jangan gunakan float.
- **Timezone:** Asia/Jakarta (WIB) untuk semua tampilan.
- **Responsive:** App Booth dan Kasir dioptimalkan untuk mobile portrait. Live Display untuk landscape 1920×1080.
- **Target sentuh minimal 48×48px.** Semua tombol aksi utama minimal 64px tinggi.
- **Audit log wajib** untuk setiap perubahan status.

---

## 11. Seed Data

```sql
INSERT INTO booths (id, code, name, discount_item_name, discount_item_price) VALUES
(1,'B1','Booth 1','[isi nama item]',1),
(2,'B2','Booth 2','[isi nama item]',1),
(3,'B3','Booth 3','[isi nama item]',1),
(4,'B4','Booth 4','[isi nama item]',1),
(5,'B5','Booth 5','[isi nama item]',1),
(6,'B6','Booth 6','[isi nama item]',1);
```

Format CSV import peserta:
```csv
qr_code,name,company,title,photo_url,allow_name_display
PRIMA-0001,Budi Santoso,PT Maju Jaya,Direktur Operasional,https://...,true
```

Kolom `allow_name_display` opsional — jika kosong, default `true`.

---

## 12. Acceptance Criteria

Sistem dianggap siap jika seluruh poin berikut lolos:

- [ ] Scan QR badge menampilkan data peserta dalam < 2 detik
- [ ] Peserta tidak bisa mengambil item diskon 2× di booth yang sama — diuji dengan **dua device menekan submit bersamaan**
- [ ] Peserta **bisa** mengambil item diskon di 6 booth berbeda
- [ ] Order void mengembalikan kuota item diskon
- [ ] Kasir melihat seluruh pending order dari semua booth dalam satu layar
- [ ] Tombol "Tandai Lunas" mati sampai nomor referensi terisi sesuai jumlah digit metode
- [ ] Metode pembayaran dapat dinyalakan/dimatikan dari Settings, dan metode terakhir yang aktif tidak dapat dimatikan
- [ ] Leaderboard hanya menghitung order `paid`/`handed_over`
- [ ] Leaderboard update otomatis dalam < 10 detik tanpa refresh manual
- [ ] Barang hanya bisa diserahkan jika status `paid`
- [ ] Mengubah `pickup_mode` di Settings mengubah alur di semua device booth dalam < 30 detik tanpa reload manual
- [ ] Order yang dibuat sebelum perubahan `pickup_mode` tetap mengikuti mode lamanya
- [ ] Mode `immediate` membuat order langsung `handed_over` saat kasir menandai lunas
- [ ] Mengubah `name_display_mode` mengubah tampilan Live Display dalam < 30 detik
- [ ] Peserta dengan `allow_name_display = false` tetap tampil sebagai inisial walaupun setting global = `full`
- [ ] Response API leaderboard **tidak memuat** nama lengkap saat mode bukan `full`
- [ ] Export CSV berisi seluruh kolom rekonsiliasi
- [ ] Aplikasi berjalan lancar di Chrome Android dan Safari iOS
- [ ] Banner offline muncul saat koneksi terputus

---

## 13. Di Luar Cakupan (Out of Scope)

- Integrasi dengan mesin EDC atau payment gateway
- Manajemen inventori/SKU per item reguler
- Cetak struk dari sistem (struk berasal dari mesin EDC)
- Aplikasi untuk peserta (peserta hanya membawa badge fisik)
- Registrasi peserta on-site (data di-import sebelum acara)

---

## 14. Prioritas Pengerjaan

Kerjakan berurutan. Jika waktu habis, hentikan di batas MVP.

**MVP (wajib jadi):**
1. Auth + role
2. Import peserta + seed booth
3. App Booth: scan → buat order (dengan constraint diskon)
4. App Kasir: scan → tandai lunas
5. Live Display: top spender

**Penting:**
6. Serahkan barang + halaman Settings (`pickup_mode`, `name_display_mode`)
7. Void + alasan
8. Dashboard admin + export CSV
9. Auto-void 45 menit

**Nice to have:**
10. Booth Explorer leaderboard
11. Activity ticker
12. Pencarian peserta manual
13. Audit log viewer
