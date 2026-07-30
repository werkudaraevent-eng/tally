-- Indeks untuk halaman audit trail (BR-18).
--
-- audit_logs hanya punya indeks pada order_id dan user_id. Halaman audit selalu
-- mengurutkan berdasarkan waktu terbaru dan memfilter kategori aksi, sehingga
-- tanpa indeks ini setiap pembukaan halaman melakukan sequential scan + sort.
-- Belum terasa pada 195 baris, tapi participant_sync menambah 4 baris/jam terus
-- menerus, jadi biarnya tumbuh tanpa batas.
create index if not exists idx_audit_logs_created_at
  on public.audit_logs (created_at desc);

-- Filter kategori memakai `action`, dan halaman menyembunyikan participant_sync
-- secara default (135 dari 195 baris berasal dari cron dan akan menenggelamkan
-- perubahan konfigurasi yang justru ingin diaudit).
create index if not exists idx_audit_logs_action_created_at
  on public.audit_logs (action, created_at desc);
