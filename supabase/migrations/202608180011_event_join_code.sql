-- ============================================================================
-- Kode gabung acara (P11).
--
-- Peserta membuka satu alamat pendek lalu mengetik angka yang tertera di layar,
-- persis seperti Slido. QR tetap ada dan tetap jalur tercepat; kode ini untuk
-- keadaan yang selalu terjadi di ruangan nyata: orang duduk terlalu jauh untuk
-- memindai, kameranya tidak fokus, atau HP-nya menolak membuka pemindai.
--
-- MILIK ACARA, bukan milik pertanyaan. Peserta bergabung sekali di awal sesi dan
-- ikut seluruh pertanyaan yang menyusul; kode per pertanyaan berarti mengetik
-- ulang tiap kali MC berganti topik.
--
-- ANGKA SAJA, tujuh digit. Huruf memaksa peserta berpindah ke papan ketik
-- alfabet di HP dan menambah kebingungan O/0 dan I/1 saat dibacakan MC dari
-- panggung. Tujuh digit memberi sepuluh juta kemungkinan — cukup jarang untuk
-- tidak bentrok, cukup pendek untuk dibacakan sekali.
-- ============================================================================

alter table public.events
  add column if not exists join_code text;

-- Unik GLOBAL, bukan per event. Halaman /join tidak punya konteks acara sama
-- sekali -- kode itulah satu-satunya petunjuk -- jadi dua acara berkode sama
-- membuat salah satunya tidak dapat dijangkau.
create unique index if not exists events_join_code_unique on public.events (join_code)
  where join_code is not null;

comment on column public.events.join_code is
  'Kode gabung tujuh digit yang diketik peserta di /join. Unik global; NULL berarti acara ini tidak membuka jalur kode.';

/**
 * Kode acak yang dijamin belum terpakai.
 *
 * Perulangan, bukan sekali coba: pada 10 juta kemungkinan tabrakan memang jarang,
 * tetapi "jarang" bukan "tidak pernah", dan satu tabrakan yang tidak ditangani
 * akan muncul sebagai galat unik saat panitia menyiapkan acara.
 *
 * Digit pertama dijaga bukan nol supaya kode yang dibacakan MC tidak kehilangan
 * angka depannya saat ada yang mengetiknya ke aplikasi lain sebagai bilangan.
 */
create or replace function public.generate_join_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_percobaan int := 0;
begin
  loop
    v_code := (1 + floor(random() * 9))::int::text
              || lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.events where join_code = v_code);
    v_percobaan := v_percobaan + 1;
    -- Penjaga terhadap perulangan tanpa akhir bila suatu saat ruang kodenya
    -- nyaris penuh. Lebih baik gagal terang-terangan daripada menggantung.
    if v_percobaan > 50 then
      raise exception 'JOIN_CODE_EXHAUSTED';
    end if;
  end loop;
  return v_code;
end $$;

create or replace function public.set_event_join_code(p_event_id uuid, p_actor uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := public.generate_join_code();
  v_lama text;
begin
  select join_code into v_lama from public.events where id = p_event_id;
  update public.events set join_code = v_code, updated_at = now() where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  -- Dicatat karena penggantian kode MEMUTUS peserta yang sudah memegang kode
  -- lama: mereka akan mengetik angka yang tidak lagi menemukan apa pun. Pada
  -- acara yang sedang berjalan itu keputusan yang perlu punya jejak.
  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'event_join_code_set',
          jsonb_build_object('old', v_lama, 'new', v_code));

  return v_code;
end $$;

-- Backfill: acara yang sudah ada langsung punya kode, tanpa perlu dibuka
-- CMS-nya satu per satu. Acara arsip ikut diberi kode -- tidak ada ruginya, dan
-- mengecualikannya berarti acara yang dihidupkan kembali kehilangan jalur ini
-- tanpa sebab yang terlihat.
do $$
declare
  r record;
begin
  for r in select id from public.events where join_code is null loop
    update public.events set join_code = public.generate_join_code() where id = r.id;
  end loop;
end $$;

revoke all on function public.generate_join_code() from public, anon, authenticated;
grant execute on function public.generate_join_code() to service_role;

revoke all on function public.set_event_join_code(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_event_join_code(uuid, uuid) to service_role;
