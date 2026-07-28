# Setup Cron

Vercel Hobby plan hanya mengizinkan cron sekali sehari, jadi penjadwalan tidak
memakai `vercel.json`. Kedua job dibagi berdasarkan karakternya:

| Job | Dijalankan oleh | Alasan |
| --- | --- | --- |
| Auto-void order pending | **Supabase `pg_cron`** | Murni operasi database, tidak perlu HTTP. Paling andal. |
| Sync peserta | **cron-job.org** | Perlu memanggil Scanner API lewat kode Next.js. |

## Auto-void — sudah aktif di Supabase

Tidak ada yang perlu disetel manual. Dijadwalkan lewat migrasi
`202607280010_pg_cron_auto_void.sql`:

- Job name: `tally-auto-void`
- Jadwal: tiap 5 menit (`*/5 * * * *`)
- Perintah: `select public.auto_void_expired_orders();`

Karena berjalan di dalam database, job ini tetap jalan meski Vercel atau
cron-job.org sedang bermasalah. Tidak butuh `CRON_SECRET`.

Cek status / riwayat eksekusi:

```sql
-- daftar job
select jobid, jobname, schedule, active from cron.job;

-- 10 eksekusi terakhir
select jobid, status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 10;
```

Ubah jadwal (mis. jadi tiap 2 menit saat hari-H):

```sql
select cron.alter_job(
  (select jobid from cron.job where jobname = 'tally-auto-void'),
  schedule => '*/2 * * * *'
);
```

Nonaktifkan sementara:

```sql
select cron.unschedule('tally-auto-void');
```

Endpoint `/api/cron/auto-void` di Vercel **tetap tersedia** sebagai jalur manual
atau darurat (lihat contoh uji manual di bagian bawah).

## Sync peserta — setel di cron-job.org

### Prasyarat

- Aplikasi sudah live di Vercel, mis. `https://tally-xi-gold.vercel.app`
- `CRON_SECRET` sudah diisi di Environment Variables Vercel (nilai sama dengan
  yang dipakai di sini). Ganti `<CRON_SECRET>` di bawah dengan nilai asli Anda.

### Job — Sync peserta dari Event Scanner

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
- Untuk hari-H, percepat interval auto-void lewat `cron.alter_job` (lihat di
  atas), bukan lewat cron-job.org.
- Uji manual endpoint (PowerShell), ganti domain & secret:

  ```powershell
  # auto-void (jalur manual/darurat)
  Invoke-WebRequest -Uri 'https://<DOMAIN-VERCEL>/api/cron/auto-void' -Method Post -Headers @{ Authorization = 'Bearer <CRON_SECRET>' }

  # sync peserta
  Invoke-WebRequest -Uri 'https://<DOMAIN-VERCEL>/api/cron/sync-participants' -Method Post -Headers @{ Authorization = 'Bearer <CRON_SECRET>' }
  ```
