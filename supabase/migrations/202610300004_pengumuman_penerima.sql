-- ---------------------------------------------------------------------------
-- Pengumuman untuk sebagian peserta (Messages > Announcements > Send to).
--
-- Dua penerima baru di samping semua dan disetujui:
--   syarat = peserta yang cocok dengan 1-3 syarat (audience_rules), dengan
--            aturan yang sama dengan Agenda > Who sees it: kolom pilihan
--            peserta, Hotel dari Logistics, atau Organisasi (@company). Dicek
--            saat peserta membuka portal, jadi peserta yang pindah batch
--            ikut melihatnya.
--   pilih  = peserta tertentu (audience_ids, 1-500 id peserta).
-- Keduanya hanya untuk akun yang tertaut ke peserta (disetujui), dan disaring
-- di server; bentuk yang rusak tidak tampil ke siapa pun (gagal tertutup).
--
-- Pengumuman yang sudah ada tetap semua/disetujui dengan dua kolom baru null:
-- peserta melihat 0 perubahan. Satu transaksi, aman dijalankan ulang. Kode
-- aman sebelum migrasi ini (membaca tanpa kolom baru), tapi syarat dan
-- peserta tertentu baru bisa disimpan sesudahnya.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

alter table public.event_announcements
  add column if not exists audience_rules jsonb,
  add column if not exists audience_ids uuid[];

alter table public.event_announcements
  drop constraint if exists event_announcements_audience_check;

alter table public.event_announcements
  add constraint event_announcements_audience_check
  check (audience in ('semua', 'disetujui', 'syarat', 'pilih'));

alter table public.event_announcements
  drop constraint if exists event_announcements_audience_shape;

alter table public.event_announcements
  add constraint event_announcements_audience_shape check (
    (audience in ('semua', 'disetujui') and audience_rules is null and audience_ids is null)
    or (
      audience = 'syarat'
      and audience_ids is null
      and audience_rules is not null
      and jsonb_typeof(audience_rules) = 'array'
      and jsonb_array_length(audience_rules) between 1 and 3
    )
    or (
      audience = 'pilih'
      and audience_rules is null
      and audience_ids is not null
      and cardinality(audience_ids) between 1 and 500
    )
  );

comment on column public.event_announcements.audience is
  'semua = semua akun area peserta; disetujui = akun yang tertaut ke peserta; syarat = peserta yang cocok dengan audience_rules; pilih = peserta di audience_ids.';
comment on column public.event_announcements.audience_rules is
  'Untuk audience syarat: 1-3 syarat [{field, values}] seperti rundown_items.audience, plus field @company (Organisasi).';
comment on column public.event_announcements.audience_ids is
  'Untuk audience pilih: id peserta (participants.id) yang melihat pengumuman ini, 1-500.';

commit;

notify pgrst, 'reload schema';
