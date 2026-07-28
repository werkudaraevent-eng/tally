-- Auto-void dijalankan langsung di database via pg_cron.
-- Alasan: Vercel Hobby plan membatasi cron job menjadi sekali sehari, sedangkan
-- auto-void perlu berjalan tiap beberapa menit selama acara.
--
-- Karena auto_void_expired_orders() adalah fungsi database, pg_cron dapat
-- memanggilnya langsung lewat SQL: tanpa HTTP, tanpa CRON_SECRET, dan tanpa
-- bergantung pada Vercel atau layanan cron pihak ketiga.
create extension if not exists pg_cron with schema cron;

-- Hindari duplikasi job jika migrasi dijalankan ulang.
select cron.unschedule(jobid) from cron.job where jobname = 'tally-auto-void';

select cron.schedule(
  'tally-auto-void',
  '*/5 * * * *',
  $$select public.auto_void_expired_orders();$$
);
