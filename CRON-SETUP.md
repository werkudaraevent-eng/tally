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

## Pesan peserta — pg_cron + pg_net (Supabase)

Dijadwalkan lewat migrasi `202610030003_pesan_peserta.sql`:

- Job name: `tally-pesan`
- Jadwal: tiap menit (`* * * * *`)
- Perintah: bila ada kiriman yang antre, jatuh tempo, atau masih mengirim,
  memanggil `POST <tally_site_url>/api/cron/pesan` lewat `pg_net` dengan
  `Authorization: Bearer <tally_cron_secret>`. Tanpa antrean, job tidak
  memanggil apa pun.

Dua rahasia disimpan di Supabase Vault, sekali saja (SQL Editor):

```sql
select vault.create_secret('https://eventhub.werkudara.group', 'tally_site_url');
select vault.create_secret('<nilai CRON_SECRET di Vercel>', 'tally_cron_secret');
```

"Kirim sekarang" langsung mulai mengirim dari Vercel; job ini jaring pengaman
(putaran yang terpotong batas waktu) dan pelaksana kiriman terjadwal.

Cek hasil panggilan terakhir:

```sql
select id, status_code, left(content::text, 200), created
from net._http_response order by created desc limit 10;
```

Nonaktifkan sementara: `select cron.unschedule('tally-pesan');`

## Sync peserta — setel di cron-job.org

### Prasyarat

- Aplikasi sudah live di domain produksi: `https://eventhub.werkudara.group`
  (domain `tally-eventhub.vercel.app` tetap jalan, tapi pakai domain kustom agar
  cron tidak ikut mati kalau project di-rename di Vercel).
- `CRON_SECRET` sudah diisi di Environment Variables Vercel (nilai sama dengan
  yang dipakai di sini). Ganti `<CRON_SECRET>` di bawah dengan nilai asli Anda.

### Job — Sync peserta dari Event Scanner

- **Title**: Tally sync participants
- **URL**: `https://eventhub.werkudara.group/api/cron/sync-participants`
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
  Invoke-WebRequest -Uri 'https://eventhub.werkudara.group/api/cron/auto-void' -Method Post -Headers @{ Authorization = 'Bearer <CRON_SECRET>' }

  # sync peserta
  Invoke-WebRequest -Uri 'https://eventhub.werkudara.group/api/cron/sync-participants' -Method Post -Headers @{ Authorization = 'Bearer <CRON_SECRET>' }
  ```
