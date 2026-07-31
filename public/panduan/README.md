# Gambar panduan operator

Berkas di folder ini muncul di panel bantuan dalam aplikasi (tombol **Panduan**
di layar booth dan kasir) serta di halaman cetak `/panduan`.

## Aturan penting: jangan pakai data peserta asli

Halaman `/panduan` **terbuka tanpa login**, supaya panitia bisa langsung
mencetaknya. Artinya gambar apa pun di folder ini bisa dilihat siapa saja yang
tahu alamatnya.

Screenshot layar booth secara alami memuat nama peserta, instansi, dan nominal
transaksi. Kalau screenshot peserta asli diunggah ke sini, data peserta ikut
terbit ke internet lewat halaman panduan.

Karena itu pakai peserta contoh. Jalankan:

```powershell
node --env-file=.env.local scripts/panduan-demo-data.mjs setup
```

Perintah itu membuat satu peserta contoh bernama "Budi Contoh" dengan QR
`DEMO-PANDUAN-01` yang bisa discan seperti peserta biasa. Setelah semua gambar
selesai diambil, hapus datanya:

```powershell
node --env-file=.env.local scripts/panduan-demo-data.mjs cleanup
```

## Cara mengambil gambar

1. Jalankan `npm run dev`, lalu login sebagai operator booth.
2. Buka layar booth di ponsel atau di browser dengan lebar layar ponsel
   (DevTools → mode perangkat) agar gambarnya sesuai dengan apa yang dilihat staf.
3. Ambil screenshot tiap langkah sesuai daftar di bawah.
4. Potong bagian yang tidak perlu, sisakan bagian layar yang sedang dibicarakan.
5. Simpan sebagai PNG atau WebP, lebar **maksimal 900 px** (lebih dari itu hanya
   memperlambat pemuatan di ponsel staf tanpa terlihat lebih jelas).
6. Daftarkan berkasnya di `STEP_IMAGES` pada `src/lib/panduan-steps.ts`.

Gambar yang belum didaftarkan tidak akan dirender. Ini disengaja: menunjuk berkas
yang belum ada akan memunculkan ikon gambar rusak di layar staf, yang terlihat
seperti aplikasi bermasalah.

## Daftar gambar yang dibutuhkan

Kolom **ID langkah** harus sama persis dengan kunci di `STEP_IMAGES`.

### Booth

| ID langkah | Isi gambar | Nama berkas yang disarankan |
| --- | --- | --- |
| `scan-qr` | Tombol SCAN QR terlihat jelas di layar booth | `booth-01-scan-qr.png` |
| `cari-manual` | Layar Cari peserta manual dengan kolom pencarian terisi | `booth-02-cari-manual.png` |
| `periksa-nama` | Kartu nama peserta setelah QR terbaca | `booth-03-periksa-nama.png` |
| `item-spesial` | Daftar item spesial, sertakan satu yang tidak bisa dicentang beserta alasannya | `booth-04-item-spesial.png` |
| `nominal` | Kolom nominal terisi dan angka TOTAL terlihat | `booth-05-nominal.png` |
| `buat-order` | Tombol Buat order | `booth-07-buat-order.png` |

### Booth — tergantung setting acara

Hanya salah satu yang tampil, mengikuti `pickup_mode` dan
`cashier_confirmation_required` yang sedang aktif. Sebaiknya siapkan keduanya
supaya panduan tetap bergambar bila admin mengubah setting.

| ID langkah | Kapan tampil | Isi gambar |
| --- | --- | --- |
| `nomor-order-otomatis` | Barang diserahkan langsung | Kolom nomor order yang sudah terisi sendiri |
| `nomor-stiker` | Barang diambil setelah lunas | Kolom nomor stiker |
| `selesai-kasir-serah-langsung` | Lewat kasir + serah langsung | Layar setelah order dibuat |
| `selesai-kasir-rak` | Lewat kasir + ambil nanti | Layar setelah order dibuat, status Menunggu kasir |
| `selesai-lunas-serah-langsung` | Tanpa kasir + serah langsung | Layar order langsung lunas |
| `selesai-lunas-rak` | Tanpa kasir + ambil nanti | Layar order lunas, barang disimpan |

### Kasir

| ID langkah | Isi gambar | Nama berkas yang disarankan |
| --- | --- | --- |
| `kasir-pilih-peserta` | Antrean pembayaran | `kasir-01-antrean.png` |
| `kasir-centang-order` | Daftar order dengan kotak centang | `kasir-02-centang.png` |
| `kasir-cek-total` | Angka TOTAL | `kasir-03-total.png` |
| `kasir-metode` | Pilihan metode pembayaran | `kasir-04-metode.png` |
| `kasir-referensi` | Kolom nomor referensi, tombol Tandai lunas masih mati | `kasir-05-referensi.png` |
| `kasir-tandai-lunas` | Nomor order setelah lunas | `kasir-06-lunas.png` |

## Catatan versi cetak

Di halaman cetak, gambar ditampilkan kecil dan berdampingan dengan teksnya.
Kalau ditampilkan sebesar di panel, panduan satu halaman bisa membengkak menjadi
belasan halaman dan boros tinta.
