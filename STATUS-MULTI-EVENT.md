# Status Multi-Event — Prima Hub

Terakhir diperbarui: **2026-08-18**
Branch: **sudah di-merge ke `main` dan di-push** (`807d1c3`, 38 commit)
Commit terakhir: `fix(routing): baca slug event dari Referer di handler, bukan lewat rewrite`

---

## 1. Ringkasan satu paragraf

Platform sudah benar-benar multi-tenant di lapisan data: 18 tabel domain punya
`event_id`, semua FK lintas tabel berbentuk komposit `(event_id, id)` sehingga
kebocoran lintas event ditolak database dengan `23503`, dan seluruh RPC yang
menjumlahkan atau menghapus sudah menerima `p_event_id`. **Dua event aktif
bersamaan sudah diuji dan berhasil** (14/14 endpoint API + 6 halaman publik
membalas 200 untuk kedua event, dengan data yang benar-benar terpisah).
Pengelolaan akses user per event kini punya layarnya sendiri, jadi event hasil
duplikat bisa dipakai operator booth dan kasir. Form registrasi publik sudah
jalan penuh kecuali pengiriman email (ditunda atas permintaan). Penghalang
terbesar sudah lepas: **`main` sudah berisi kode baru dan sudah di-push**, jadi
signature RPC di database dan kode aplikasi kembali sejalan. Penghalang kedua
juga lepas: slug event kini terbaca dari Referer di handler, sehingga dua event
aktif bersamaan tidak lagi menuntut penyuntingan 129 pemanggil.

---

## 2. Kondisi database produksi saat ini

| Metrik | Nilai |
|---|---|
| Jumlah event | 2 |
| Event aktif | 1 (`prima-executive-gathering-2026`) |
| Event draft | 1 (`uji-duplikat-dari-ui` — sisa pengujian, boleh dihapus) |
| Peserta | 278 |
| Order | 225 |
| Baris `user_event_access` | 15 |
| Sinkronisasi peserta terakhir | **2026-08-11 06:40 UTC (mati ± 2 hari)** |

Migrasi terpasang: `202608070001` … `202608070016` (16 berkas, semuanya SUDAH
dijalankan ke DB produksi).

---

## 3. Yang SUDAH selesai

### Skema & migrasi (semua terpasang di produksi)
- `0001` registry `events` + `user_event_access`
- `0002` `event_id` di 18 tabel + 15 FK komposit
- `0003` perbaikan `sync_booth_builtin_offer` per event
- `0004` tabel singleton di-unsingleton (buang `CHECK (id = 1)`, tambah sequence)
- `0005` bridge trigger untuk insert lama
- `0006` sequence untuk `booths.id`
- `0007` `resolve_event_id()`
- `0008` scope RPC leaderboard
- `0009` scope RPC undian
- `0010` DEFAULT `resolve_event_id(null)` di 21 tabel (jaring pengaman)
- `0011` scope RPC destruktif (`admin_reset_records`, `auto_void`)
- `0012` scope RPC scan booth
- `0013` scope sinkronisasi peserta
- `0014` buang FK ganda satu kolom
- `0015` scope RPC transaksi inti (order/settle/void/handover) + buang `admin_upsert_booth`
- `0016` `duplicate_event()`

### Aplikasi
- Pemilih event `/events` + workspace `/e/[slug]`
- CRUD event + siklus hidup (draft → active → completed → archived)
- **UI kelola akses user per event** (`/events/[id]/access`) — beri/cabut akses,
  peran per event, dropdown booth discope event target. `super_admin` sengaja
  ditolak 422 supaya invarian "tanpa baris = akses semua event" tidak jadi bohong
- **UI aktifkan/nonaktifkan event** — aksi berbeda per status, konfirmasi menyebut
  akibatnya, prasyarat aktivasi yang kurang dilaporkan terpisah
- **UI duplikat event** — dialog menampilkan panel "ikut disalin" / "tidak disalin"
  SEBELUM dikirim
- Seluruh route API sudah discope event (transaksi, admin, publik, undian, rundown,
  seat-map, audit, export)
- Seluruh `.eq("id", 1)` di `src/` sudah hilang

### Verifikasi terukur
- Isolasi lintas event di DB: 6/6 + 7/7 (event kedua + rollback disengaja)
- `/booth` dan `/cashier` diuji di browser sampai jalur TULIS: 8 penolakan benar,
  order tetap 225, `audit_logs` bertambah 0 baris
- **Dua event aktif bersamaan**: 14/14 endpoint API 200, 6 halaman publik 200.
  Bukti terkuat: seat-map kedua event melaporkan 32 meja / 199 kursi (konfigurasi
  tersalin) tapi `occupied_seats` 194 vs 0 (peserta TIDAK tersalin)
- `duplicate_event`: booth 11, offers 15, rundown 24, hadiah 2, entri 46, sesi
  seat-map 2, 4 baris settings — identik; peserta/order/pemenang/akses = 0;
  nol referensi lintas event
- UI akses diuji sampai jalur TULIS di event draft: `user_event_access`
  15 → 16 → 15, event produksi tetap 15 baris, order tetap 225. Tiga penolakan
  benar: booth event lain 404, peran booth tanpa booth 422, `super_admin` 422
- 51 insert `audit_logs` ditelusuri satu per satu: 44 sudah benar, 1 bolong
  (`leaderboard_exclusions` POST) sudah ditambal. Sisa 6 memang lintas event
  (`payment_methods`, `users`, unggah aset display) — tabelnya global, tidak
  punya `event_id`, jadi mengisinya justru berbohong
- Registrasi publik diuji di browser sampai jalur TULIS, di event **draft**:
  daftar → antre → setujui → peserta terbit ber-QR `REG######`, reviewer
  tercatat, `event_id` peserta = `event_id` pendaftaran. Peserta produksi tetap
  278, order tetap 225. Enam uji SQL lulus: pendaftaran ditolak saat ditutup,
  email duplikat ditolak, setujui ganda ditolak, id lintas event ditolak,
  auto-approve menerbitkan QR seketika, nama ter-trim + email jadi huruf kecil
- Toggle "Buka pendaftaran" menolak event bersumber `manual` dengan pesan yang
  menyebut apa yang harus diubah, bukan galat CHECK Postgres
- `npm run build` lulus sebelum merge; `main` di-push (`6321c76..807d1c3`)
- Slug dari Referer diuji dengan DUA event aktif sungguhan: Referer berbeda →
  event berbeda, tanpa Referer → 404 ambigu, Referer slug ngawur → 404 (sebelum
  perbaikan: 422, yaitu diam-diam dilayani event lain)
- `npm run typecheck` + `npm run lint` + `npm run check` bersih

---

## 4. Yang BELUM selesai (urut prioritas)

### P1 — Deploy — SELESAI (2026-08-13)
Produksi menjalankan kode lama sementara signature RPC di database sudah berubah;
sinkronisasi peserta mati sejak 2026-08-11 06:40. `feat/multi-event-foundation`
di-merge ke `main` (`807d1c3`, merge commit, riwayat 38 commit dipertahankan) dan
di-push — Vercel men-deploy otomatis.

Prasyarat saat merge sudah terpenuhi: tepat SATU event `active`. Ini penting
karena tautan publik tanpa slug (`/display`, `/denah`, `/rundown`) hanya hidup
saat tepat satu event aktif — kalau lebih, ia membalas 404 (disengaja).

**Verifikasi yang tersisa untuk pengguna:** buka dasbor Vercel, pastikan deploy
hijau, lalu cek sinkronisasi peserta jalan lagi (kolom sync terakhir bergerak).

### P7 — `fetch("/api/...")` absolut di sisi klien — SELESAI
Ditemukan saat mengerjakan P3, dituntaskan 2026-08-13. Halaman klien memanggil
`/api/...` tanpa slug; proxy menambahkannya dari Referer, dan tambahan saat
rewrite tidak pernah sampai ke handler — permintaannya jatuh ke "event aktif
tunggal". Dengan dua event aktif, halaman admin event A akan membaca dan MENULIS
ke event lain.

Rencana awal: bungkus 129 pemanggilan dengan `eventApiPath()`. **Tidak jadi.**
Cabang Referer di `src/proxy.ts` ternyata KODE MATI — diukur dengan slug ngawur:
lewat Referer tetap 422 (dilayani event aktif tunggal), lewat `?eventSlug=`
langsung 404. Yang salah bukan pemanggilnya, melainkan tempat Referer dibaca.

Perbaikannya: Referer dibaca di `eventSlugFromRequest()`
(`src/lib/auth/event-slug.ts`), tempat handler benar-benar melihatnya; cabang
mati di proxy dibuang. Satu perbaikan menggantikan 129 penyuntingan, dan
pemanggil baru tidak bisa lupa memakainya.

Urutan sumber slug: **query > path > referer**. Referer terakhir supaya pemanggil
yang menyebut slug eksplisit tidak dikalahkan halaman asal, dan hanya untuk
`/api/...` — halaman menerima slug lewat rewrite proxy.

Dibuktikan dengan DUA event aktif sungguhan: Referer berbeda → event berbeda
(satu 200 bernama event draft, satu 422 event produksi), tanpa Referer → 404
ambigu (bukan menebak). Data uji dikembalikan setelahnya.

`eventApiPath()` tetap ada dan tetap berguna untuk pemanggil yang ingin
eksplisit; ia hanya bukan lagi satu-satunya penyelamat. Ada `npm run check` —
9 pemeriksaan urutan prioritas, karena salah urutan gagalnya SENYAP.

### P3b — Kirim kode peserta lewat email — KODE SELESAI (2026-08-18)
Resend, dipanggil lewat `fetch` biasa. **Tanpa dependensi baru**: yang dipakai
hanya satu endpoint dengan enam field, dan paket `resend` tidak menambah
kemampuan di atas itu. `qrcode` yang sudah terpasang menggambar lampiran PNG.

Bentuknya: kirim langsung di jalur permintaan, tanpa outbox dan tanpa percobaan
ulang otomatis. Kegagalan disimpan sebagai teks di
`event_registrations.email_error` dan panitia menekan **Kirim ulang**. Outbox
menuntut penjadwal kedua di samping cron yang sudah ada, dan email gagal bukan
keadaan darurat — kodenya tetap tampil di layar sukses pendaftar dan di layar
moderasi.

Aturan yang dijaga:
- **Email hanya disebut kalau benar-benar terkirim.** Layar sukses membaca
  `email_sent` dari jawaban server, bukan dari "seharusnya sudah aktif". Kunci
  API kosong, alamat ditolak, dan penyedia mati semuanya sampai sebagai `false`,
  dan teks "potret layar ini sekarang" kembali muncul.
- **Kode tetap ditampilkan besar** di kedua layar walau emailnya terkirim. Email
  masuk spam adalah kejadian biasa; kode di layar satu-satunya salinan yang pasti.
- **Gagal kirim TIDAK mengubah status HTTP persetujuan.** Pesertanya sudah dibuat;
  membalas 5xx membuat admin menekan Setujui lagi dan menabrak
  `REGISTRATION_ALREADY_REVIEWED`. Statusnya menempel sebagai field `email`.
- **Kirim ulang satu baris per permintaan, tanpa versi massal.** Satu klik salah
  mengirim ratusan email yang tidak dapat ditarik, dan lonjakannya membuat
  penyedia menandai domain acara sebagai spam — sehingga pendaftar BERIKUTNYA
  ikut tidak menerima apa pun.
- **`email_attempts` naik lewat RPC**, bukan baca-lalu-tulis dari klien Supabase.
  Dua penekanan berbarengan akan sama-sama membaca 2 dan menulis 3.
- **`RESEND_API_KEY`/`EMAIL_FROM` sengaja TIDAK masuk `src/lib/env.ts`.** Berkas
  itu memvalidasi di tingkat modul; menambahkannya di sana membuat seluruh
  aplikasi gagal start hanya karena email belum disetel.

**Belum dijalankan:** migrasi `202608180002` belum diterapkan ke DB produksi, dan
`RESEND_API_KEY` + `EMAIL_FROM` belum diisi di Vercel. Sampai keduanya ada,
fiturnya diam sepenuhnya — tombol kirim ulang disembunyikan dan tidak ada teks
yang menjanjikan email.

### P6 — Hapus event — KODE SELESAI (2026-08-18)
`DELETE /api/events/[id]` + tombol **Hapus permanen** di `/events`, menggantikan
rencana skrip SQL sekali pakai.

Penghapusan berjalan di dalam RPC `delete_event`, bukan sebagai rangkaian
`.delete()` dari route handler: klien Supabase mengirim tiap penghapusan sebagai
permintaan HTTP terpisah dengan transaksinya sendiri, dan gagal di tabel ke-12
meninggalkan 11 tabel kosong sementara event-nya masih ada — keadaan yang tidak
diwakili status mana pun.

Penjaga berlapis, masing-masing menutup kegagalan berbeda:
- `super_admin` saja, sejajar dengan reset data dan kelola user (BR-17).
- `confirm_slug` harus diketik ulang dan cocok. Yang dicegah bukan "menekan tanpa
  membaca" melainkan **menekan pada baris yang salah**: kartu event berjajar dan
  tombolnya identik.
- Status wajib `draft`/`archived` dan **nol order**, ditegakkan DI DALAM fungsi.
  Diperiksa di route, hitungannya sudah basi saat penghapusan berjalan.
- Order adalah satu-satunya data di sini yang mewakili UANG; sisanya bisa dibuat
  ulang. Event yang pernah bertransaksi **diarsipkan, tidak dihapus**.
- Peserta sengaja TIDAK diperiksa — peserta uji itulah yang harus ikut terbuang.

Urutan 19 langkah mengikuti FK, dan tiga di antaranya bukan tebakan:
`audit_logs.order_id -> orders` dan `seat_map_sessions.seat_map_id -> seat_maps`
keduanya NO ACTION (harus lebih dulu), sementara tujuh tabel setelan +
`user_event_access` sudah `on delete cascade` sehingga sengaja tidak disebut.
Balapan dengan order yang masuk bersamaan tidak butuh penguncian tambahan:
`orders.event_id ... on delete restrict` menolak langkah terakhir dengan 23503
dan membatalkan seluruh transaksi.

**Belum dijalankan:** migrasi `202608180001` belum diterapkan ke DB produksi, dan
`uji-duplikat-dari-ui` **masih ada**. Menghapusnya adalah langkah pengguna
setelah migrasi terpasang.

---

## 5. Keputusan arsitektur yang JANGAN diubah tanpa alasan

- **Tidak ada `users.event_id`.** Satu kolom = satu event → satu orang butuh 2 PIN
  dan jejak auditnya terpecah. Akses per event lewat `user_event_access`, dan
  `role` disimpan per event (bisa admin di A, kasir di B).
- **`super_admin` tanpa baris `user_event_access` = akses semua event.** Kalau
  harus didaftarkan manual, pembuat event tidak bisa membuka event buatannya sendiri.
- **Tautan publik tanpa slug hanya hidup saat TEPAT SATU event aktif.**
  `active_event_ids()` mengembalikan SETOF, bukan "yang terbaru" — menebak event
  berarti menayangkan data event yang salah di proyektor tanpa satu pun galat.
- **`events.slug` tidak boleh diubah** setelah dibuat: sudah tercetak di QR dan
  tersimpan di bookmark layar LED.
- **Event baru selalu `draft`**, tidak pernah langsung `active`.
- **Gagal membaca `user_event_access` harus FAIL CLOSED (500)**, berbeda dari
  pembatas login yang fail-open. Fail-open di sini berarti memberi akses ke event
  orang lain.
- **`payment_methods` dan `users` memang GLOBAL** — jangan discope, keduanya tidak
  punya kolom `event_id`.

---

## 6. Jebakan yang sudah memakan korban (baca sebelum menyentuh area terkait)

1. **`where id = 1` di dalam fungsi Postgres.** Setelah singleton di-unsingleton,
   `id = 1` berhenti berarti "satu-satunya baris" dan mulai berarti "baris
   TERTUA" = event pertama. `create_order_transaction` membaca settings event
   LAIN. Nol galat, build hijau, GET sehat. Grep di `src/` saja TIDAK cukup —
   harus juga `select proname from pg_proc where prosrc ilike '%where id = 1%'`.

2. **Query yang DITAMBAHKAN saat rewrite tidak pernah sampai ke route handler.**
   Berlaku untuk `next.config rewrites()` MAUPUN `NextResponse.rewrite()` di
   `src/proxy.ts`. Rewrite-nya sendiri jalan, tapi `request.url` di handler tetap
   URL asli. Query dari CALLER tetap sampai — itulah kenapa bug ini diam total
   sampai ada event kedua aktif. Solusi sekarang: `eventSlugFromRequest()` membaca
   slug dari PATH (`/^\/e\/([^/]+)\//`).

   **Sisi KLIEN sudah ditangani (2026-08-13).** Halaman yang memanggil
   `fetch("/api/...")` absolut tidak punya slug di path; proxy menambahkannya
   dari Referer, dan tambahan itulah yang hilang. Terukur saat membuat halaman
   registrasi: PATCH dari `/e/<slug>/admin/registrasi` mengenai event PRODUKSI.
   Rencana awal membungkus 129 pemanggilan dengan `eventApiPath()` DIBATALKAN
   setelah terbukti cabang Referer di proxy adalah kode mati: Referer dibaca
   langsung di `eventSlugFromRequest()` (`src/lib/auth/event-slug.ts`), satu
   tempat, dan pemanggil tidak perlu diubah sama sekali.

   **Pelajarannya:** saat sebuah perbaikan menuntut ratusan penyuntingan
   seragam, curigai lapisannya dulu. Ukur mana sumber yang benar-benar sampai
   (pakai nilai NGAWUR — kalau tetap dilayani, berarti sumber itu diabaikan)
   sebelum menyunting satu pun pemanggil.

3. **Menambah parameter berdefault = OVERLOAD, bukan mengganti.** Versi lama tanpa
   scope event tetap bisa dipanggil = pintu bocor, dan pemanggil lama jadi ambigu
   `42725`. Wajib `drop function if exists <nama>(<signature lama>)` dulu.

4. **`supabase.rpc(... as never)` TIDAK dicek TypeScript.** Setelah mengubah
   signature RPC, wajib grep `rpc("<nama>"` secara manual.

5. **Mengganti constraint unik memutus setiap `ON CONFLICT` yang menunjuknya.**
   Sudah kena DUA kali (`sync_booth_builtin_offer`, lalu `undian_exclusions`).
   Grep `on conflict` di SQL **dan** `onConflict:` di TypeScript sebelum mengganti
   PK/unique/index apa pun. Gejalanya tidak muncul saat migrasi jalan — hanya saat
   baris berikutnya ditulis.

6. **`to_jsonb(baris) - 'id'` memberi NULL EKSPLISIT**, dan NULL tidak memicu
   DEFAULT kolom → `23502`. Harus ditimpa `nextval('seq')`.

7. **`23502` saat menguji FK komposit berarti UJINYA yang salah**, bukan
   sistemnya. Kode yang benar untuk penolakan lintas event adalah `23503`, dan
   untuk tabrakan unik `23505`.

---

## 7. Cara memverifikasi (yang terbukti bekerja)

- **Uji migrasi berisiko** di `create schema _scratch` + replika tabel, lalu
  `raise exception 'ROLLBACK-DISENGAJA: %', hasil;` untuk membawa hasil keluar
  tanpa meninggalkan data. Tools MCP menampilkannya sebagai error — itu normal.
- **Uji kebocoran** dengan mengukur SEBELUM dan SESUDAH: buat event kedua + data,
  hitung ulang, bandingkan. "pool 247 → 247" membuktikan tidak bocor; "247" saja
  tidak membuktikan apa-apa.
- **Hitung ekspektasi lewat SQL mentah** dan bandingkan dengan RPC di DALAM SATU
  query. Itu yang membuatnya jadi tes, bukan pengulangan kode.
- **Uji browser sampai jalur TULIS.** Tiga lapis verifikasi statis (typecheck,
  lint, probe GET) melewatkan bug terberat di proyek ini. Cegah tersimpan dengan
  `page.route("**/api/orders")` + `route.abort()`, atau arahkan ke baris yang
  sudah void sehingga handler menolak SESUDAH guard peran.
- **Sesi tanpa PIN**: `createHmac("sha256", SESSION_SECRET).update(user.id)` →
  cookie `tally_session = id.signature`, dipasang lewat
  `page.context().newCDPSession(page)` + `Network.setCookie`.

---

## 8. Berkas kunci

| Berkas | Peran |
|---|---|
| `src/proxy.ts` | middleware (Next.js 16 menamainya `proxy`, bukan `middleware`) |
| `src/lib/auth/event-slug.ts` | **sumber slug: query > path > referer** (fungsi murni) |
| `src/lib/auth/event-slug.check.ts` | 9 pemeriksaan urutan sumber — `npm run check` |
| `src/lib/auth/request-event.ts` | slug → event + aturan fallback satu event aktif |
| `src/lib/auth/guards.ts` | `requireUser(roles)`, `requireRequestEvent()` |
| `src/app/events/page.tsx` | pemilih event + aksi status + duplikat |
| `src/app/events/[id]/access/page.tsx` | UI hak akses per event |
| `src/app/api/events/[id]/route.ts` | siklus hidup event |
| `src/app/api/events/[id]/duplicate/route.ts` | duplikat event |
| `src/app/api/events/[id]/access/route.ts` | GET/PUT/DELETE hak akses |
| `supabase/migrations/202608070016_duplicate_event.sql` | RPC duplikat |
| `src/lib/event-url.ts` | `eventApiPath()` — opsional, untuk fetch klien yang ingin eksplisit |
| `src/app/daftar/` | form registrasi publik |
| `src/app/admin/registrasi/page.tsx` | moderasi + toggle pendaftaran |
| `src/app/api/registrasi/route.ts` | endpoint publik tanpa login |
| `supabase/migrations/202608130001_public_registration.sql` | antrean registrasi |
| `src/lib/email/client.ts` | transport Resend lewat `fetch`, tidak pernah melempar |
| `src/lib/email/registration-code.ts` | template + orkestrasi kirim & pencatatan |
| `src/app/api/admin/registrasi/resend/route.ts` | kirim ulang, satu baris per permintaan |
| `supabase/migrations/202608180001_delete_event.sql` | RPC hapus event, 19 langkah berurut FK |
| `supabase/migrations/202608180002_registration_email.sql` | jejak kirim + `record_registration_email` |
| `tasks/multi-event-plan.md` | rencana asli |

---

## 9. Langkah berikutnya yang disarankan

P1 dan P7 sudah selesai. P3b dan P6 **kodenya** sudah selesai; yang tersisa
seluruhnya di luar repo dan tidak dapat dikerjakan dari sini.

1. **Terapkan dua migrasi baru ke DB produksi**, berurutan, lewat SQL Editor
   Supabase:
   - `202608180001_delete_event.sql`
   - `202608180002_registration_email.sql`

   Keduanya aditif — `create function` dan `add column if not exists`. Tidak ada
   `drop`, tidak ada perubahan constraint yang sudah dirujuk `ON CONFLICT`, jadi
   jebakan #3 dan #5 tidak berlaku di sini.

2. **Isi env di Vercel** (Project Settings → Environment Variables):
   `RESEND_API_KEY`, `EMAIL_FROM`, opsional `EMAIL_REPLY_TO`. Domain di
   `EMAIL_FROM` **wajib** sudah diverifikasi di dashboard Resend; kalau belum,
   penyedia menolak dengan "domain is not verified" dan pesannya muncul apa
   adanya di layar moderasi.

3. **Uji sampai jalur TULIS di event DRAFT, bukan produksi.** Ini aturan yang
   sudah menyelamatkan proyek ini dua kali (lihat §7): daftar satu pendaftar uji
   dengan alamat sungguhan, setujui, pastikan emailnya sampai berikut lampiran
   QR, lalu tekan Kirim ulang dan pastikan `email_attempts` naik.

4. **Hapus `uji-duplikat-dari-ui`** lewat tombol Hapus permanen di `/events`.
   Sekaligus bukti bahwa P6 bekerja. Sebelum menekan, catat jumlah order
   produksi (225) dan bandingkan setelahnya — "225 → 225" membuktikan tidak ada
   yang bocor; angka tunggal tidak membuktikan apa pun.
