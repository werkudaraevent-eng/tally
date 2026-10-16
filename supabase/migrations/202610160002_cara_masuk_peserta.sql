-- ---------------------------------------------------------------------------
-- Cara masuk area peserta per acara (Participant area > How participants sign
-- in, landing_config.member.sign_in). Bawaan tetap email + kata sandi; dua
-- cara baru:
--
--   email_code  kode 6 digit ke email setiap kali masuk. Kodenya baris
--               participant_account_tokens berjenis 'kode' (hanya sha256 dari
--               id baris + kode yang disimpan, berlaku 10 menit, sekali pakai).
--   fields      dua kolom data peserta pilihan admin. Peserta tanpa email pun
--               bisa masuk, jadi participant_accounts.email boleh kosong.
--
-- Tidak ada data yang diubah. Indeks unik (event_id, email) tetap berlaku untuk
-- email yang terisi; baris tanpa email tidak saling bertabrakan.
-- ---------------------------------------------------------------------------

set lock_timeout = '5s';

alter table public.participant_account_tokens
  drop constraint if exists participant_account_tokens_purpose_check;
alter table public.participant_account_tokens
  add constraint participant_account_tokens_purpose_check
  check (purpose in ('konfirmasi', 'sandi', 'undangan', 'data', 'kode'));

alter table public.participant_accounts
  alter column email drop not null;

comment on column public.participant_accounts.email is
  'Huruf kecil. Kosong hanya untuk akun dari cara masuk dua kolom data peserta, bila pesertanya tanpa email atau emailnya sudah dipakai akun lain.';

notify pgrst, 'reload schema';
