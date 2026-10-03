# Rencana Logistik Peserta: kamar, bus, dan item yang diambil

Status: migrasi `202609300002` s.d. `202609300005` **sudah di produksi**
(30 Sep 2026). Halaman admin Logistik (`/admin/logistik`: Kamar, Bus, Agenda
bus, Barang), pilihan barang per sesi di Kehadiran, dan daftar centang barang
di layar scan sudah dibuat. Impor Excel dan kartu area peserta belum.

Tujuan: peserta melihat di area peserta (`/e/<slug>/peserta`) nomor kamar dan
teman sekamarnya, bus yang ia naiki di tiap agenda, dan barang yang menjadi
haknya (kaos dengan ukurannya, goodie bag) beserta status sudah diambil.
Panitia mengisi semuanya per acara, lewat CMS atau impor Excel.

Desain layar: Figma "Tally, Halaman acara PRIMA 2026", halaman "Area peserta
(member)".

---

## Keputusan panitia (30 Sep 2026)

| # | Pertanyaan | Jawaban | Akibatnya pada model |
|---|---|---|---|
| 1 | Teman sekamar harus sesama jenis kelamin? | Ya | `assign_room` menolak kamar campuran (`ROOM_GENDER_MISMATCH`). Jenis kelamin dibaca dari field formulir di `participants.extra`, key-nya disetel per acara. |
| 2 | Teman sekamar tampil ke peserta? | Ya, dan panitia bisa menyembunyikan | Tampil secara bawaan; `landing_config.member.show_roommates = false` menyembunyikan. |
| 3 | Ukuran kaos dipilih di mana? | Sudah ada di data peserta | Tidak ada tabel pilihan ukuran. Item menyebut key field ukurannya di `participants.extra`. |
| 4 | Satu bus untuk semua perjalanan? | Nama umum ("Bus 3"); bus biasanya tetap, tapi bisa diganti per agenda | Bus bawaan per peserta + pengganti per agenda, di satu tabel. |
| 5 | Siapa menandai kaos sudah diambil? | Scan operator, lewat sesi scan | Sesi scan (`attendance_sessions`) kini bisa memuat daftar item yang diperiksa. |

---

## Keadaan sebelum ini

- Kursi sudah ada di `participants.seats`, diisi sinkron Scanner. Tidak
  dimodelkan ulang.
- Jawaban field formulir (ukuran kaos, jenis kelamin) tersimpan di
  `participants.extra`, dan ketiga jalur masuk peserta (pendaftaran, tambah
  manual, impor) sudah mengisinya sejak `202609050001`.
- Sesi scan dan jalur (meja) sudah ada: `attendance_sessions`,
  `attendance_scans`, `attendance_lanes`.
- Konvensi yang diikuti: `event_id` + FK komposit `(event_id, x_id)` supaya
  baris anak tidak bisa menunjuk data acara lain; RLS aktif tanpa policy,
  akses hanya service role; RPC `security definer` dengan execute hanya untuk
  `service_role`; tulis `audit_logs` dari RPC.

---

## 1. Kamar (`202609300002`)

```
events 1─1 lodging_settings
events 1─* lodging_hotels 1─* lodging_rooms 1─* lodging_assignments *─1 participants
```

- **Teman sekamar tidak disimpan**, diturunkan dari penghuni kamar yang sama.
- **Jenis kelamin** tidak jadi kolom baru di `participants`. Panitia membuat
  field "Jenis kelamin" di formulir (atau kolom impor), lalu memilih key
  field itu di pengaturan Kamar (`lodging_settings.gender_field_key`).
  Perbandingan tidak peka huruf besar dan spasi tepi ("Pria" = "pria ").
  Kolom baru berarti mengubah sinkron Scanner, `save_participant`, dan
  `import_participants` sekaligus untuk data yang jalurnya sudah ada.
- `enforce_same_gender` bawaannya menyala. Selama menyala, penempatan
  ditolak bila key field belum disetel (`LODGING_GENDER_FIELD_NOT_SET`) atau
  peserta belum punya jawaban (`PARTICIPANT_GENDER_UNKNOWN`).
- Tanggal check-in/out: peserta, lalu kamar, lalu hotel.

| RPC | Penjaga |
|---|---|
| `assign_room(event, room, participant, actor, check_in?, check_out?)` | Kamar dikunci `for update`; `ROOM_FULL`, `ROOM_GENDER_MISMATCH`; peserta yang dihapus di sumber tidak dihitung penghuni. Audit `lodging_assigned`. |
| `unassign_room(event, participant, actor)` | Audit `lodging_unassigned`. |

## 2. Bus (`202609300003`)

```
events 1─* transport_vehicles   ("Bus 1", kapasitas)
events 1─* transport_trips      (agenda yang memakai bus, follows_default)
transport_assignments: trip_id null = bus bawaan, trip_id terisi = pengganti
```

- Bus peserta di satu agenda = **penggantinya bila ada, selain itu bus
  bawaan** (bila agenda itu `follows_default`).
- Agenda dengan `follows_default = false` disusun ulang seluruhnya: hanya
  pengganti yang berlaku (mis. pulang ke dua tujuan berbeda).
- Pengganti dengan `vehicle_id` null = "tidak naik bus di agenda ini".
- Aturan di atas ditulis sekali di `transport_effective(event)`; grid admin,
  pemeriksaan kapasitas, dan area peserta semuanya membacanya.

| RPC | Guna |
|---|---|
| `assign_bus(event, trip?, vehicle?, participant_ids[], actor)` | Set/hapus bus bawaan, atau set pengganti per agenda. Kapasitas diperiksa di semua agenda yang terdampak (`VEHICLE_FULL` dengan detail agenda). Semua tulis bus satu acara diserialkan dengan kunci advisory. |
| `reset_bus_override(event, trip, participant_ids[], actor)` | Kembalikan ke bus bawaan di satu agenda. |
| `transport_overview(event)` | Grid agenda × bus: isi, kapasitas, `over_capacity`. Kapasitas bisa terlampaui dari luar RPC (kapasitas diturunkan, agenda diubah jadi mengikuti bawaan); grid menandainya alih-alih mengunci panitia. |

## 3. Item yang diambil di sesi scan (`202609300004`)

```
events 1─* pickup_items (nama, size_field_key)
attendance_sessions *─* pickup_items   lewat attendance_session_items
item_pickups: satu baris per (item, peserta), dengan sesi, jalur, petugas, ukuran saat diambil
```

- Admin membuat sesi scan seperti biasa ("Registrasi"), lalu memilih item
  yang diperiksa di sesi itu (Kaos, Goodie bag). Satu item bisa dibagikan
  di lebih dari satu sesi; tetap hanya bisa diambil sekali per peserta.
- Ukuran dibaca dari `participants.extra[size_field_key]`, dan **disalin**
  ke `item_pickups.size` saat diserahkan.
- Pencatatan kehadiran (`record_attendance_scan`) tidak diubah. Layar scan
  memanggil `pickup_checklist` setelah memindai, lalu `record_item_pickup`
  untuk item yang dicentang. Kedatangan dan penyerahan barang bisa terjadi
  terpisah (stok habis, datang terlambat).

| RPC | Guna |
|---|---|
| `pickup_checklist(event, session, participant)` | Item sesi ini + ukuran peserta + sudah diambil atau belum. |
| `record_item_pickup(event, session, participant, item_ids[], actor, lane?)` | `SESSION_CLOSED`, `ITEM_NOT_IN_SESSION`, `PARTICIPANT_NOT_FOUND`. Yang sudah diambil tidak ditimpa, dilaporkan di `already`. Audit `item_picked_up`. |
| `undo_item_pickup(event, item, participant, actor)` | Untuk admin saja, bukan layar scan. Audit `item_pickup_undone`. |
| `pickup_item_recap(event)` | Jumlah per item per ukuran dan yang sudah diambil. Untuk pesanan vendor dan stok hari-H. Peserta tanpa ukuran muncul sebagai baris ukuran kosong. |

## 4. Area peserta dan duplikasi (`202609300005`)

- `member_logistics(event, participant)` mengembalikan `lodging` (hotel,
  nomor kamar, tanggal, teman sekamar: nama dan perusahaan saja, atau null
  bila disembunyikan), `transport` (bus bawaan dan tiap agenda dengan
  busnya, plus penanda bila berbeda dari biasanya), dan `items`. Tidak
  pernah mengirim catatan kamar, kontak kru, atau pelat nomor.
  `show_roommates` dibaca di dalam RPC supaya data yang disembunyikan tidak
  pernah keluar dari database.
- `duplicate_event` kini memanggil `copy_logistics_config`: pengaturan kamar,
  hotel, kamar, bus, agenda bus, dan item disalin dengan waktu digeser sejauh
  selisih tanggal acara. Penempatan dan catatan pengambilan tidak disalin.
- `delete_event` tidak perlu diubah: semua tabel baru `on delete cascade`
  lewat acara dan peserta. Diuji.

---

## Alur panitia

Menu admin **Logistik** (grup Peserta), tab **Kamar** dan **Transportasi**;
item diatur di halaman sesi scan.

- **Kamar:** pengaturan field jenis kelamin; hotel dan kamarnya, penghuni,
  penanda penuh/kosong/campuran; peserta yang belum dapat kamar.
- **Transportasi:** daftar bus; bus bawaan per peserta (pilih banyak lalu
  "Tempatkan di Bus 3"); grid agenda × bus dari `transport_overview`; per
  agenda: ikuti bus bawaan atau susun ulang, dan pengganti per peserta.
- **Sesi scan:** tiap sesi bisa memilih item yang diperiksa; rekap per
  ukuran dari `pickup_item_recap`, bisa diekspor.
- **Impor Excel satu lembar** (pola `import_participants`: dry run lalu
  terapkan, cocokkan lewat `qr_code`):

  | qr_code | hotel | kamar | tipe_kamar | kapasitas | bus |
  |---|---|---|---|---|---|

  Hotel, kamar, dan bus yang belum ada dibuat otomatis saat impor. Kolom
  `bus` mengisi bus bawaan; pengganti per agenda diatur di CMS. Jenis kelamin
  dan ukuran kaos lewat impor peserta biasa (field `extra`).

## Alur scan operator

Setelah memindai di sesi yang punya item, layar menampilkan daftar centang
(Kaos L, Goodie bag) dan peringatan bila item sudah diambil sebelumnya.
Petugas mencentang yang diserahkan.

## Alur peserta (belum dibuat)

`/e/<slug>/peserta` memanggil `member_logistics` sekali dan menampilkan kartu
Kamar, Bus, Tempat duduk (dari `seats`), dan Barang, masing-masing hanya bila
datanya ada. Ukuran kaos tidak diubah dari area peserta.

## Catatan

- Peserta yang dihapus di sumber lalu dipulihkan bisa membuat kamar
  melebihi kapasitas (tempatnya sudah diisi orang lain). Halaman Kamar perlu
  menandai kamar seperti itu.
- Mengubah jawaban jenis kelamin setelah penempatan tidak memindahkan
  peserta; halaman Kamar perlu menandai kamar campuran.

## Tahapan

1. ~~Migrasi tabel + RPC, `duplicate_event` diperbarui.~~ Selesai, di produksi.
2. ~~Halaman admin Logistik.~~ Selesai. Impor Excel belum.
3. Area peserta: kartu Kamar, Bus, Tempat duduk, Barang.
4. ~~Item di sesi scan: pengaturan di admin, daftar centang di layar scan.~~
   Selesai. Pembatalan penyerahan (`undo_item_pickup`) belum punya layar.
