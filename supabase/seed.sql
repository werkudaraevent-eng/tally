-- Run after the initial schema migration.
-- Replace PIN hashes before production. These rows are only operational placeholders.

insert into participants (qr_code, name, company, title, allow_name_display)
values
  ('PRIMA-0001', 'Budi Santoso', 'PT Maju Jaya', 'Direktur Operasional', true),
  ('PRIMA-0002', 'Maya Prameswari', 'PT Arunika Prima', 'Chief Executive Officer', true),
  ('PRIMA-0003', 'Raka Wijaya', 'Nusantara Energi', 'Direktur Komersial', true),
  ('PRIMA-0004', 'Nadia Kusuma', 'PT Satu Visi', 'Direktur Keuangan', false)
on conflict (qr_code) do nothing;

-- Demo users require real bcrypt/argon2 hashes before authentication is enabled.
-- Do not insert plaintext PIN values into pin_hash.
