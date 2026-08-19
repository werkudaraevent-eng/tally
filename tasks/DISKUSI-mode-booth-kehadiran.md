# Diskusi: mode booth untuk pencatatan kehadiran (tanpa serah terima)

Status: **bahan diskusi, belum diputuskan, belum ada kode.**
Ditulis: 2026-08-14. Sumber kebenaran fitur lain tetap `STATUS-MULTI-EVENT.md`.

---

## 1. Kebutuhan

Ada acara yang butuh **pencatatan kehadiran murni**: peserta datang, QR dipindai,
selesai. Tidak ada uang, tidak ada barang yang berpindah.

Akalan yang sekarang terpikir: bikin booth bernama "Registration", set **Tanpa
transaksi**, lalu pakai item spesial Rp 0 sebagai penanda. Masalahnya:

1. Operator tetap harus **mencentang item** dulu sebelum tombol aktif.
2. Tombolnya berbunyi **"Serahkan barang/item"** — padahal tidak ada barang.
3. Layar tetap meminta **nomor order/stiker** (`PH-001`), yang tidak ada artinya
   untuk kehadiran.

Jadi pertanyaannya: bikin subsistem attendance baru, atau lebarkan fitur booth?

---

## 2. Kondisi kode saat ini (terverifikasi, bukan ingatan)

### 2.1 Sifat booth sudah ada, tapi hanya 2 nilai

- `booths.transactions_enabled boolean not null default true`
  (`202608020001_booth_without_transactions.sql`).
- UI: radio "Sifat booth" di `src/app/admin/booths/page.tsx` (~baris 112–140).
- Layar operator membaca lewat `/api/booth/context` dan menyembunyikan kolom
  nominal: `const transactionsEnabled = booth?.transactions_enabled !== false`
  (`src/app/booth/page.tsx` ~447).
- Penegakan sebenarnya di DB: `create_order_transaction` menolak
  `p_regular_amount <> 0` untuk booth tanpa transaksi.

### 2.2 Yang MENGHALANGI order kosong (ini inti masalahnya)

`202608020002_reject_empty_orders.sql`, versi live sekarang
`202608070015_scope_transaction_rpcs_to_event.sql` baris ~110:

```sql
if p_regular_amount = 0 and coalesce(array_length(offer_codes, 1), 0) = 0 then
  raise exception using errcode = '22023', message = 'EMPTY_ORDER';
end if;
```

Aturan itu **disengaja** dan alasannya masih benar untuk booth jualan: order
hampa memakan nomor order, muncul di riwayat, dan menaikkan hitungan kunjungan
booth tanpa ada isinya. Untuk booth kehadiran, justru order hampa itulah datanya.
**Ini satu-satunya alasan operator sekarang wajib mencentang item.**

### 2.3 Yang sudah gratis kalau menumpang booth

Menumpang booth berarti dapat semua ini tanpa menulis apa pun:

| Kemampuan | Berkas |
| --- | --- |
| Login + scope per event + guard peran | `src/lib/auth/guards.ts` |
| Pindai QR & cari peserta (nama/instansi) | `src/app/api/booth/participants/route.ts` |
| Tolak peserta yang dihapus panitia | `source_removed_at` di `booth/page.tsx` |
| Riwayat & koreksi (void) | `/api/orders/[id]/void`, `booth/scan-history` |
| Anti-dobel oleh 2 perangkat | `orders.code` unik + `for update` |
| Kuota 1x per peserta | `special_offers.max_per_participant` |
| Banner offline | `src/app/offline-banner.tsx` |
| Audit log | `audit_logs.event_id` |
| Syarat undian `checked_in` | `src/lib/undian.ts` ~209 |
| Duplikat event menyalin booth | `202608070016_duplicate_event.sql` ~156 |

### 2.4 Catatan penting: kehadiran SUDAH ada untuk sebagian event

`participants.source_checked_in` diisi cron dari Scanner API
(`upsert_external_participants`, tiap 5 menit) dan sudah dipakai di laporan,
denah, dan syarat undian.

Artinya kebutuhan ini **hanya berlaku untuk event dengan
`participant_source` = `manual` / `public_form`** — event yang tidak punya
Scanner API. Kalau eventnya `scanner_api`/`hybrid`, kehadiran sudah tercatat dan
booth kehadiran justru bikin dua sumber kebenaran yang bisa berbeda.

**Pertanyaan diskusi #1: event yang butuh ini yang mana? Kalau ternyata semuanya
pakai Scanner API, seluruh pekerjaan ini batal.**

---

## 3. Tiga pilihan

### Opsi A — Subsistem attendance baru (`attendance_logs`)

Tabel sendiri, layar sendiri, laporan sendiri, ekspor sendiri.

- Untung: model datanya jujur. Tidak ada "order Rp 0" di tabel `orders`.
- Rugi: menulis ulang semua yang ada di tabel §2.3 — pencarian peserta, void,
  anti-dobel, offline, audit, duplikat event, ekspor. Dua layar operator yang
  hampir sama tapi beda tipis = dua tempat memperbaiki bug yang sama.
- Perkiraan: 1 migrasi besar + ~6 berkas baru + perubahan di laporan/undian/
  duplikat event.

### Opsi B — Booth dapat sifat ketiga: `attendance`

Ganti `transactions_enabled` (boolean, 2 nilai) menjadi satu kolom bernilai tiga:
`sales` / `handover` / `attendance`.

- Untung: satu layar operator, satu jalur data, semua di §2.3 langsung berlaku.
- Rugi: menyentuh `create_order_transaction` (fungsi paling ramai) dan laporan.
- Risiko yang harus dijaga: order Rp 0 tanpa item **tidak boleh** masuk hitungan
  `total_orders`, `paid_orders`, revenue, maupun top spender.

### Opsi C — Tanpa perubahan skema: pertajam yang sudah ada

Booth "Tanpa transaksi" + item spesial Rp 0 (kuota 1x, `counts_toward_leaderboard
= false`) **sudah bekerja hari ini**. Yang kurang cuma 3 hal kosmetik:

1. Centang item **otomatis terpilih** saat booth punya tepat satu item Rp 0.
2. Label tombol mengikuti sifat booth ("Catat kehadiran", bukan "Serahkan barang").
3. Kolom nomor order disembunyikan (server tetap membuatnya otomatis).

- Untung: **diff terkecil**, nol migrasi, nol risiko ke `create_order_transaction`.
- Rugi: modelnya berbohong sedikit — kehadiran tercatat sebagai "item Rp 0".
  Admin masih harus paham cara menyetelnya (3 langkah manual di 2 halaman).

---

## 4. Saran

**Mulai dari C, siapkan jalan ke B. Jangan A.**

Alasan: A membangun ulang belasan hal yang sudah teruji di lapangan hanya untuk
mengganti bentuk satu baris data. Bedanya "kehadiran" dan "serah terima barang"
di lapangan cuma satu: ada tidaknya benda fisik. Alur kerjanya — pindai, cek
peserta, tolak dobel, bisa dikoreksi — identik.

Kalau setelah dipakai ternyata C cukup, berhenti di C. Kalau admin sering salah
setel, naik ke B.

### Kalau naik ke B: cara yang tidak memecahkan apa pun

Jebakan #3 di memori repo: parameter berdefault di RPC bikin **overload**, bukan
pengganti. Menyentuh `create_order_transaction` (dipakai setiap order di seluruh
acara) untuk fitur pinggiran itu risiko yang tidak sebanding.

Jalan keluarnya: tambah kolom `mode`, lalu **`transactions_enabled` diubah jadi
kolom generated** yang membaca `mode`:

```sql
-- BELUM DIJALANKAN — bahan diskusi.
alter table public.booths add column mode text not null default 'sales'
  check (mode in ('sales', 'handover', 'attendance'));
update public.booths set mode = 'handover' where transactions_enabled = false;
alter table public.booths drop column transactions_enabled;
alter table public.booths add column transactions_enabled boolean
  generated always as (mode = 'sales') stored;
```

Akibatnya: **semua fungsi yang MEMBACA `transactions_enabled` tetap benar tanpa
disunting.** Yang wajib disunting hanya yang MENULIS-nya, yaitu
`admin_upsert_booth` (kolom generated tidak bisa ditulis) dan pemanggilnya di
`src/app/api/admin/booths/route.ts`.

Lalu `create_order_transaction` cukup satu baris tambahan: pengecualian
`EMPTY_ORDER` saat `booth_row.mode = 'attendance'`.

**Perlu diperiksa dulu sebelum menyetujui:** `202608070016_duplicate_event.sql`
menyalin baris booth lewat `to_jsonb(baris)` — jebakan #6 di memori repo. Kolom
generated di dalam `jsonb_populate_record` bisa membuat insert gagal. **Wajib
diuji di lokal sebelum diterapkan; kalau gagal, pakai trigger biasa, bukan
generated column.**

---

## 5. Yang tetap harus diputuskan, opsi mana pun

Ini bagian yang paling gampang terlewat, dan efeknya ke laporan.

1. **Laporan.** `/api/admin/reports` menghitung `total_orders` dari SELURUH baris
   `orders`. Baris kehadiran akan menggelembungkan angka itu. Harus dikecualikan,
   dan yang muncul justru "Hadir: 128 dari 244".
2. **Progress peserta.** Layar booth menampilkan "x dari y booth". Booth kehadiran
   ikut terhitung sebagai booth belanja — perlu dikeluarkan.
3. **Top spender.** Aman kalau `counts_toward_leaderboard = false`, tapi harus
   dipastikan tersetel, bukan diasumsikan.
4. **Ekspor.** `src/lib/export-orders.ts` akan memuat baris Rp 0.
5. **Nomor order.** Kehadiran tidak butuh `PH-001`, tapi kolom `orders.code` unik
   dan wajib. Dibuat otomatis di server, disembunyikan di layar.
6. **Sekali atau berkali-kali?** Kehadiran biasanya sekali. Tapi acara 2 hari?
   Sesi pagi dan sore? `max_per_participant` cuma satu angka, tidak mengenal hari.
7. **Bentrok dengan `source_checked_in`.** Lihat §2.4. Kalau event pakai Scanner
   API, mana yang menang? Syarat undian `checked_in` membaca kolom Scanner API,
   bukan booth. Peserta yang dipindai di booth kehadiran tetap dianggap **belum
   hadir** oleh undian. Ini bug yang pasti muncul kalau tidak diputuskan sekarang.

**Pertanyaan diskusi #2: nomor 7 diselesaikan bagaimana — booth kehadiran ikut
menulis `source_checked_in`, atau syarat undian yang dilebarkan?**

---

## 6. Perbedaan tiga mode, kalau B jadi dipilih

| | `sales` | `handover` | `attendance` |
| --- | --- | --- | --- |
| Kolom nominal | tampil, wajib | disembunyikan + ditolak DB | disembunyikan + ditolak DB |
| Item spesial | opsional | **wajib** (barangnya) | tidak dipakai |
| Order tanpa isi | ditolak | ditolak | **diterima** |
| Nomor order di layar | tampil | tampil | disembunyikan |
| Tombol | "Simpan order" | "Serahkan barang" | "Catat kehadiran" |
| Masuk revenue / top spender | ya | tidak | tidak |
| Masuk progress booth | ya | ya | **belum diputuskan** |

---

## 7. Langkah berikutnya

1. Jawab pertanyaan #1 (§2.4) — bisa membatalkan seluruhnya.
2. Jawab pertanyaan #2 (§5 no. 7).
3. Kalau lanjut: kerjakan C dulu (3 perubahan kosmetik, tanpa migrasi), pakai di
   satu acara sungguhan, baru nilai apakah B perlu.
