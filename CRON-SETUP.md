# Setup Cron Eksternal (cron-job.org)

Vercel Hobby plan hanya mengizinkan cron sekali sehari, jadi kedua job dipicu
dari layanan cron eksternal gratis (cron-job.org) yang memanggil endpoint di
aplikasi. Endpoint sudah diproteksi dengan `CRON_SECRET`.

## Prasyarat

- Aplikasi sudah live di Vercel, mis. `https://tally-xi-gold.vercel.app`
- `CRON_SECRET` sudah diisi di Environment Variables Vercel (nilai sama dengan
  yang dipakai di sini). Ganti `<CRON_SECRET>` di bawah dengan nilai asli Anda.

## Job 1 — Auto-void order pending

- **Title**: Tally auto-void
- **URL**: `https://<DOMAIN-VERCEL>/api/cron/auto-void`
- **Request method**: `POST`
- **Schedule**: setiap 5 menit (Every 5 minutes)
- **Headers** (tab Advanced → Headers):
  - Key: `Authorization`
  - Value: `Bearer <CRON_SECRET>`

## Job 2 — Sync peserta dari Event Scanner

- **Title**: Tally sync participants
- **URL**: `https://<DOMAIN-VERCEL>/api/cron/sync-participants`
- **Request method**: `POST` (endpoint juga menerima `GET`)
- **Schedule**: setiap 15 menit (Every 15 minutes)
- **Headers**:
  - Key: `Authorization`
  - Value: `Bearer <CRON_SECRET>`

## Catatan

- Jika header `Authorization` salah/kosong, endpoint membalas `403 FORBIDDEN`
  (bukan menjalankan job). Itu berarti proteksi bekerja.
- Respons sukses auto-void: `{ "voided_count": <n> }`.
- Respons sukses sync: `{ "source_total", "fetched", "synced", "synced_at" }`.
- Untuk hari-H, boleh percepat interval sesuai kebutuhan (mis. auto-void tiap
  2-3 menit) selama dalam batas paket cron-job.org.
- Uji manual cepat (PowerShell), ganti domain & secret:
  ```powershell
  Invoke-WebRequest -Uri 'https://<DOMAIN-VERCEL>/api/cron/auto-void' -Method Post -Headers @{ Authorization = 'Bearer <CRON_SECRET>' }
  ```
