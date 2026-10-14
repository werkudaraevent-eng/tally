-- ============================================================================
-- Tiket tambahan undian (Prizes & rules > Peluang menang).
--
-- Rancangan yang disetujui Hanung 2026-10-14: semua peserta mulai dengan 1
-- tiket, lalu setiap hadiah boleh punya aturan "+N tiket". Satu aturan memakai
-- salah satu dari dua sumber:
--
--   list        daftar dari panitia (upload Excel berisi QR atau email), yang
--               sudah dicocokkan ke peserta acara saat diupload. Yang disimpan
--               id pesertanya, bukan teks berkasnya.
--   conditions  pohon syarat yang sama dengan undian_prizes.conditions.
--
-- Tiket = 1 + jumlah tiket dari aturan yang cocok, dijepit ke weight_max.
--
-- Disimpan sebagai satu kolom jsonb di hadiahnya, bukan tabel sendiri: aturan
-- ikut tersimpan bersama tombol "Simpan hadiah", ikut tercatat di audit_logs
-- hadiah, dan ikut terhapus bersama hadiahnya. Bentuk isinya divalidasi route
-- admin (zod); di sini hanya dijaga bahwa nilainya array.
--
-- Hadiah yang sudah ada tidak berubah: kolom baru berisi [] dan weight_mode
-- lama ('equal' atau 'formula') tetap berlaku sampai admin memilih mode baru.
-- ============================================================================

begin;

set local lock_timeout = '5s';

alter table public.undian_prizes
  add column if not exists bonus_rules jsonb not null default '[]'::jsonb;

alter table public.undian_prizes
  drop constraint if exists undian_prizes_bonus_rules_shape;
alter table public.undian_prizes
  add constraint undian_prizes_bonus_rules_shape check (jsonb_typeof(bonus_rules) = 'array');

-- 'bonus' = tiket tambahan. CHECK lama ditulis sebaris tanpa nama, jadi namanya
-- dicari dari definisinya, bukan ditebak: kalau tebakan nama meleset, CHECK lama
-- tetap ada dan menolak 'bonus' walau constraint baru sudah terpasang.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.undian_prizes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%weight_mode%'
  loop
    execute format('alter table public.undian_prizes drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.undian_prizes
  add constraint undian_prizes_weight_mode_check check (weight_mode in ('equal', 'formula', 'bonus'));

comment on column public.undian_prizes.bonus_rules is
  'Aturan tiket tambahan saat weight_mode = ''bonus'': [{name, tickets, source: list|conditions, participant_ids | conditions, file_name, uploaded_at}].';

commit;

notify pgrst, 'reload schema';
