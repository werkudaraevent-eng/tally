-- ============================================================================
-- Jejak pengiriman email kode peserta (P3b).
--
-- Kolomnya di `event_registrations`, BUKAN di `participants`. Dua sebab:
--
--   1. `participants` ditimpa berkala oleh `upsert_external_participants`
--      (cron 5 menit). Kolom yang hanya diisi aplikasi akan hilang pada
--      sinkronisasi berikutnya -- alasan yang sama yang membuat antrean
--      pendaftaran dipisah sejak awal (202608130001).
--   2. Yang perlu dijawab panitia adalah "pendaftar ini sudah dikirimi kode
--      atau belum", dan pertanyaan itu selalu ditanyakan di layar moderasi,
--      di baris pendaftarannya.
--
-- TIDAK ada tabel antrean/outbox. Pengiriman dilakukan langsung di jalur
-- permintaan dan kegagalannya disimpan sebagai teks di sini, lalu panitia
-- menekan "Kirim ulang". Outbox dengan pekerja latar menuntut penjadwal kedua
-- di samping cron yang sudah ada, dan email yang gagal terkirim bukan keadaan
-- darurat: kodenya tetap tampil di layar sukses pendaftar dan di layar
-- moderasi panitia.
-- ============================================================================

alter table public.event_registrations
  add column if not exists email_sent_at timestamptz,
  -- Pesan kegagalan TERAKHIR, bukan riwayat. Panitia hanya perlu tahu apakah
  -- percobaan terakhir berhasil dan kalau tidak, kenapa. Riwayat lengkapnya
  -- ada di audit_logs.
  add column if not exists email_error text,
  add column if not exists email_attempts integer not null default 0;

comment on column public.event_registrations.email_sent_at is
  'Waktu email kode peserta berhasil diserahkan ke penyedia. NULL = belum pernah berhasil.';
comment on column public.event_registrations.email_error is
  'Pesan kegagalan percobaan TERAKHIR. Dikosongkan saat pengiriman berikutnya berhasil.';
comment on column public.event_registrations.email_attempts is
  'Jumlah percobaan kirim, termasuk yang gagal. Dipakai membedakan "belum pernah dicoba" dari "sudah dicoba dan gagal".';

-- Konsistensi dua arah, sama seperti registrations_reviewed_consistent: daftar
-- yang memfilter `email_sent_at is null` dan yang memfilter `email_error is not
-- null` tidak boleh memberi jawaban yang saling bertentangan untuk baris yang
-- sama.
alter table public.event_registrations
  drop constraint if exists registrations_email_state_consistent;
alter table public.event_registrations
  add constraint registrations_email_state_consistent check (
    email_sent_at is null or email_error is null
  );

-- Dipakai layar moderasi untuk menyorot "disetujui tapi emailnya belum sampai".
-- Parsial: baris yang emailnya sudah terkirim tidak perlu ikut diindeks, dan
-- itulah mayoritasnya begitu acara berjalan normal.
create index if not exists event_registrations_email_pending_idx
  on public.event_registrations (event_id, created_at desc)
  where status = 'approved' and email_sent_at is null;

-- ---------------------------------------------------------------------------
-- Catat hasil satu percobaan kirim.
--
-- Fungsi, bukan `.update()` dari route handler, karena `email_attempts` harus
-- naik ATOMIK. Lewat klien Supabase, menaikkan pencacah berarti baca-lalu-tulis
-- dalam dua permintaan HTTP terpisah; dua pengiriman yang berbarengan (panitia
-- menekan "Kirim ulang" dua kali) akan sama-sama membaca 2 dan sama-sama
-- menulis 3, sehingga hitungannya diam-diam salah persis saat ia paling
-- dibutuhkan untuk mendiagnosis.
--
-- `p_event_id` ikut diperiksa dengan alasan yang sama seperti
-- review_event_registration: id pendaftaran milik event lain tidak boleh
-- tersentuh, dan tanpa pemeriksaan ini tidak ada galat yang muncul.
-- ---------------------------------------------------------------------------
create function public.record_registration_email(
  p_event_id uuid,
  p_registration_id uuid,
  p_ok boolean,
  p_error text default null,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hasil public.event_registrations;
begin
  update public.event_registrations
     set email_attempts = email_attempts + 1,
         -- Keduanya ditulis berpasangan supaya constraint
         -- registrations_email_state_consistent tidak pernah bisa dilanggar:
         -- berhasil mengosongkan pesan galat, gagal mengosongkan waktu kirim.
         email_sent_at = case when p_ok then now() else null end,
         email_error = case when p_ok then null else nullif(btrim(coalesce(p_error, '')), '') end
   where id = p_registration_id and event_id = p_event_id
  returning * into hasil;

  if hasil.id is null then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor,
          case when p_ok then 'registration_email_sent' else 'registration_email_failed' end,
          jsonb_build_object('registration_id', hasil.id, 'email', hasil.email,
                             'attempts', hasil.email_attempts, 'error', p_error));

  return jsonb_build_object(
    'email_sent_at', hasil.email_sent_at,
    'email_error', hasil.email_error,
    'email_attempts', hasil.email_attempts
  );
end $$;

revoke all on function public.record_registration_email(uuid, uuid, boolean, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_registration_email(uuid, uuid, boolean, text, uuid)
  to service_role;
