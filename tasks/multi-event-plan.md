# Rencana Multi-Event (PLAN — belum diimplementasikan)

Status: **DRAFT / PARKIR** sampai setelah presentasi klien & hari-H.
Tujuan: membuat platform sustain untuk banyak event tanpa membongkar alur transaksi yang sudah teruji.

## Konteks sekarang (single-event)

- `event_settings` & `display_settings` memakai baris tunggal `id = 1` (hard-coded).
- `booths` memakai id tetap `1–6`.
- `orders`, `participants`, `users` tidak memiliki kolom `event_id`.
- Leaderboard RPC, cron auto-void, dan seluruh route handler mengasumsikan satu event global.

---

## Opsi B — Event registry ringan (REKOMENDASI tahap ini)

Nilai "sustain" tanpa menyentuh alur transaksi kritis. Satu event "live" pada satu waktu; ganti event = arsipkan + reset (pakai fitur reset yang sudah ada).

### Skema
```
create table events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  event_date date,
  status text not null default 'draft'    -- draft | active | archived
    check (status in ('draft','active','archived')),
  is_active boolean not null default false, -- hanya 1 boleh true (partial unique index)
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index uniq_one_active_event on events (is_active) where is_active = true;
```

### Langkah kerja
1. Migrasi tabel `events` + seed event berjalan (`prima-executive-gathering-2026`, status `active`).
2. Root page `/`:
   - Daftar event (kartu): nama, tanggal, status, tombol Buka / Aktifkan / Arsipkan / Hapus.
   - Tombol "Buat event baru" (nama + slug + tanggal).
3. API `GET/POST/PATCH/DELETE /api/admin/events` (guard `admin`).
   - Aktifkan event: set `is_active`, nonaktifkan yang lain (satu transaksi).
   - Arsipkan: `status = archived`, `archived_at = now()` (simpan ringkasan/CSV sebelum reset).
   - Hapus: hanya event `archived` atau `draft` yang boleh dihapus (guard).
4. Alur "mulai event baru": Export CSV event lama → arsipkan → jalankan reset data (`/api/admin/reset`) → aktifkan event baru.
5. Login/landing: `/` diarahkan sesuai role atau tampilkan daftar event untuk admin.

### Kelebihan / kekurangan
- (+) Effort kecil, tidak mengubah RPC transaksi, memakai fitur reset yang sudah ada.
- (−) Hanya satu event live pada satu waktu; data event lama tersimpan sebagai CSV + ringkasan, bukan baris transaksi penuh.

---

## Opsi A — Multi-event penuh (untuk kebutuhan 2+ event bersamaan)

Hanya jika nanti perlu menjalankan beberapa event serentak atau menyimpan seluruh riwayat transaksi di DB.

### Perubahan skema
- Tabel `events` (seperti di atas, tanpa batasan satu-aktif).
- Tambah `event_id uuid references events(id)` ke: `booths`, `participants`, `orders`, `users`, `event_settings`, `display_settings`.
- Ganti primary-key tunggal `id=1` pada `event_settings`/`display_settings` menjadi per-`event_id`.
- Ubah unique constraint: `uniq_discount_per_booth`, `orders.code`, `booths.code`, dll. menjadi per-event (`(event_id, ...)`).
- Ubah seluruh RPC (`create_order_transaction`, `settle_orders_transaction`, `void_order_transaction`, `get_leaderboard`, `auto_void_expired_orders`, `upsert_external_participants`) untuk menerima & memfilter `p_event_id`.

### Perubahan aplikasi
- Konsep "event aktif" di session/URL (mis. `/e/[slug]/admin/...`) atau kolom `active_event_id` pada user.
- Semua route handler menyuntikkan `event_id`.
- Cron per-event (loop semua event aktif).

### Risiko
- Migrasi besar, hampir semua RPC & handler berubah, butuh regression test menyeluruh. **Tidak dikerjakan menjelang hari-H.**

---

## Opsi C — Banyak project Supabase + banyak deploy

Isolasi total, nol perubahan kode, tapi operasional manual. Root page hanya kumpulan link. Cocok jika event benar-benar terpisah dan jarang.

---

## Keputusan

- **Sekarang:** tetap single-event (aman untuk presentasi & hari-H).
- **Setelah hari-H:** implement **Opsi B** jika butuh riwayat + landing multi-event.
- **Opsi A** hanya bila muncul kebutuhan event serentak.
