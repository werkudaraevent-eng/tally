-- Pengirim email per acara: nama yang tampil di kotak masuk peserta dan alamat
-- tujuan saat peserta menekan Balas. Alamat pengirimnya tetap dari EMAIL_FROM
-- (domainnya harus terverifikasi di Resend); hanya NAMA-nya yang diganti.
-- Kosong = memakai nama dan reply-to dari env.
alter table public.event_settings
  add column if not exists email_sender_name text,
  add column if not exists email_reply_to text;

alter table public.event_settings
  drop constraint if exists event_settings_email_sender_name_check,
  add constraint event_settings_email_sender_name_check
    check (email_sender_name is null or (char_length(email_sender_name) between 1 and 80 and email_sender_name !~ '[<>"\r\n]')),
  drop constraint if exists event_settings_email_reply_to_check,
  add constraint event_settings_email_reply_to_check
    check (email_reply_to is null or (char_length(email_reply_to) <= 254 and email_reply_to ~ '^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$'));
