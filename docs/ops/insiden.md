# Runbook insiden

Untuk saat ada yang rusak atau dicurigai dibobol di produksi. Urutannya: hentikan kerusakan, simpan bukti, pulihkan, baru cari penyebab. `main` dipakai SEMUA acara sekaligus, jadi setiap langkah di sini berdampak ke semua acara.

## 1. Tentukan jenisnya

| Gejala | Langkah pertama |
| --- | --- |
| Halaman error / fitur rusak setelah merge | Rollback deploy (bagian 2) |
| Data acara salah, terhapus, atau berubah massal | Jangan ubah apa-apa dulu, catat waktunya (bagian 4) |
| Akun staf dipakai orang lain, PIN/kata sandi bocor | Matikan akun dan cabut sesinya (bagian 3) |
| Rahasia server bocor (env Vercel, kunci API) | Rotasi rahasianya (bagian 5) |
| Email/WhatsApp terkirim massal tanpa sengaja | Matikan saklar kirim di acara itu, lalu bagian 2 bila perlu |

Catat sejak awal di satu tempat: jam mulai (WIB dan UTC), acara yang kena, apa yang dilihat, siapa yang melapor.

## 2. Rollback deploy

- Vercel > project Tally > Deployments > pilih deploy terakhir yang sehat > **Promote to Production** (Instant Rollback). Tidak perlu build ulang.
- Rollback kode TIDAK membatalkan SQL yang sudah dijalankan. Bila PR yang bermasalah punya migrasi, cek catatan rollback di file SQL-nya sebelum memutuskan apa pun.
- Setelah stabil, revert PR-nya di GitHub, supaya merge berikutnya tidak membawa masalah yang sama lagi.

## 3. Akun staf disalahgunakan

- **Admin > Users & roles**: nonaktifkan akunnya. Semua sesinya langsung berakhir.
- Atau ganti PIN-nya. Semua perangkat akun itu langsung keluar. Untuk admin, ganti PIN oleh super admin juga menghapus kata sandi dan authenticator-nya, sehingga pemilik sah harus setup ulang.
- Untuk akun sendiri: menu akun > **Sign out of all devices**.
- Mengeluarkan SEMUA staf sekaligus (darurat): owner menjalankan `delete from public.staff_sessions;` di SQL editor. Semua staf harus masuk ulang.

## 4. Data salah atau hilang

- **Jangan** memakai "Restore" pada project produksi: itu menimpa semua acara ke titik backup.
- Supabase > Database > Backups > **Restore to new project** pada waktu sebelum kejadian. Ambil data yang benar dari project sementara itu dengan SELECT, ekspor CSV, lalu tulis SQL perbaikan yang ditinjau dulu dan dijalankan owner. Hapus project sementara setelah selesai.
- Cek `audit_logs` untuk siapa melakukan apa dan kapan (filter berdasarkan `created_at` dan `action`).

## 5. Rotasi rahasia

| Rahasia | Dampak bila dirotasi |
| --- | --- |
| `SESSION_SECRET` | Semua staf keluar dan harus masuk ulang. Aman. |
| `CRON_SECRET` | Harus diganti bersamaan di Vercel, Supabase Vault dan cron-job.org (lihat `cron.md`), atau job terjadwal berhenti. |
| Kunci service role Supabase | Ganti di Supabase, lalu di Vercel, lalu redeploy. Aplikasi mati sampai keduanya sama. |
| Kunci API AI (Anthropic) | Hapus dan tempel ulang di `/ai`. |
| `INVITE_LINK_SECRET` | **Jangan dirotasi.** Semua tautan undangan yang sudah terkirim jadi tidak berlaku, dan rahasia authenticator admin serta kunci AI yang tersimpan tidak bisa dibuka lagi (semua admin harus setup ulang, kunci AI harus ditempel ulang). Hanya bila benar-benar bocor, dan dengan rencana. |

## 6. Setelah pulih

- Tulis ringkasan singkat (apa, kapan, dampak, penyebab, perbaikan) di catatan privat owner, **bukan** di repo publik ini.
- Perbaikan masuk lewat PR biasa dengan QA. Kelemahan yang belum diperbaiki tidak boleh disebut di PR atau STATUS.
