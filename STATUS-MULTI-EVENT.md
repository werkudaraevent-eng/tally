# Status Multi-Event — Prima Hub

Terakhir diperbarui: **2026-08-13**
Branch: `feat/multi-event-foundation` (34 commit di depan `main`, **BELUM di-merge, BELUM di-deploy**)
Commit terakhir: `fix(events): lengkapi event_id audit dan wajibkan eventId booth aktif`

---

## 1. Ringkasan satu paragraf

Platform sudah benar-benar multi-tenant di lapisan data: 18 tabel domain punya
`event_id`, semua FK lintas tabel berbentuk komposit `(event_id, id)` sehingga
kebocoran lintas event ditolak database dengan `23503`, dan seluruh RPC yang
menjumlahkan atau menghapus sudah menerima `p_event_id`. **Dua event aktif
bersamaan sudah diuji dan berhasil** (14/14 endpoint API + 6 halaman publik
membalas 200 untuk kedua event, dengan data yang benar-benar terpisah).
Pengelolaan akses user per event kini punya layarnya sendiri, jadi event hasil
duplikat bisa dipakai operator booth dan kasir. Yang belum ada adalah form
registrasi publik, dan yang paling mendesak: **produksi masih menjalankan kode
lama sementara signature RPC di database sudah berubah**.

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
- `npm run typecheck` + `npm run lint` bersih

---

## 4. Yang BELUM selesai (urut prioritas)

### P1 — Deploy (MENDESAK)
Produksi menjalankan kode lama, sementara **signature RPC di database sudah
berubah**. Akibat yang sudah terjadi: sinkronisasi peserta mati sejak
2026-08-11 06:40 (± 2 hari). Perbaikannya ada di branch ini, belum di-deploy.

> Sebelum deploy: pastikan hanya SATU event berstatus `active`, karena tautan
> publik tanpa slug (`/display`, `/denah`, `/rundown`) hanya hidup saat tepat
> satu event aktif — kalau lebih, ia membalas 404 (disengaja, bukan bug).

### P3 — Form registrasi publik
`events.registration_enabled` + `participant_source in (manual, public_form,
hybrid)` sudah ada di skema, halamannya belum dibuat. Kolom nama/email/telepon
wajib NOT NULL (bukan konfigurasi form) — lihat catatan arsitektur.

### P6 — Bersihkan event uji
`uji-duplikat-dari-ui` masih ada (sudah diturunkan ke `draft`, jadi aman).
Menghapusnya harus mengikuti urutan `ON DELETE RESTRICT` pada ± 15 tabel anak
(booths, special_offers, rundown_*, seat_map_*, undian_*, leaderboard_exclusions).

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
| `src/lib/auth/request-event.ts` | resolusi slug → event; baca slug dari PATH |
| `src/lib/auth/guards.ts` | `requireUser(roles)`, `requireRequestEvent()` |
| `src/app/events/page.tsx` | pemilih event + aksi status + duplikat |
| `src/app/events/[id]/access/page.tsx` | UI hak akses per event |
| `src/app/api/events/[id]/route.ts` | siklus hidup event |
| `src/app/api/events/[id]/duplicate/route.ts` | duplikat event |
| `src/app/api/events/[id]/access/route.ts` | GET/PUT/DELETE hak akses |
| `supabase/migrations/202608070016_duplicate_event.sql` | RPC duplikat |
| `tasks/multi-event-plan.md` | rencana asli |

---

## 9. Langkah berikutnya yang disarankan

1. Deploy branch ini ke produksi (P1) — sinkronisasi peserta sedang mati.
2. Hapus event uji `uji-duplikat-dari-ui` (P6).
3. Form registrasi publik (P3).
