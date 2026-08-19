-- ============================================================================
-- Voting langsung (P10, fase 1: pilihan tunggal & ganda).
--
-- Peserta memilih dari HP, bar hasil bergerak di layar panggung. Referensinya
-- Slido, tetapi bentuknya mengikuti apa yang sudah terbukti di aplikasi ini:
-- state runtime singleton per event, kontrol operator terpisah dari CMS, dan
-- layar panggung yang membaca lewat polling.
--
-- TIGA KEPUTUSAN yang membentuk seluruh berkas ini:
--
--   1. PENGHITUNG DISIMPAN, BUKAN DIHITUNG. `vote_options.vote_count` dinaikkan
--      di dalam transaksi yang sama dengan pencatatan suara. Layar panggung dan
--      ratusan HP membaca satu baris per opsi; tanpa itu setiap polling memindai
--      seluruh tabel suara, tiga puluh kali semenit, hanya untuk mendapat angka
--      yang sama.
--
--      Barisnya tetap disimpan di `vote_ballots` -- penghitung bisa dibangun
--      ulang darinya bila suatu saat dicurigai, dan pertanyaan "siapa saja yang
--      sudah memilih" hanya dapat dijawab dari sana.
--
--   2. SATU SUARA DITEGAKKAN INDEKS UNIK, bukan pemeriksaan di aplikasi.
--      `unique (poll_id, voter_key)`. Dua permintaan yang tiba bersamaan dari
--      satu orang -- tombol ditekan dua kali di jaringan lambat -- sama-sama
--      lolos pemeriksaan "sudah memilih?" bila pemeriksaannya berupa SELECT
--      terpisah. Indeks unik tidak bisa dilewati dengan cara itu.
--
--   3. MODE IDENTITAS TERBATAS PADA YANG SUDAH DIIMPLEMENTASI. Sama seperti
--      `undian_prizes.animation`: daftar tertutup menjamin tiap nilai punya
--      jalur yang menanganinya. Mode "pilih nama dari daftar", "ketik nama", dan
--      login Google menyusul di fase berikutnya beserta CHECK-nya.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Pertanyaan
-- ---------------------------------------------------------------------------
create table if not exists public.vote_polls (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete restrict,
  question text not null,
  description text,

  -- Fase 1 hanya dua. `rating` dan `wordcloud` ditambahkan ke CHECK ini pada
  -- fase yang benar-benar merendernya, supaya tidak ada pertanyaan tersimpan
  -- yang layarnya tidak tahu cara menggambarnya.
  type text not null default 'single' check (type in ('single', 'multi')),

  /*
    Mode identitas pemilih.

    `anonymous`        satu suara per perangkat, dikunci cookie.
    `participant_code` peserta mengetik kode di badge-nya.

    Keduanya BUKAN kekuatan yang sama, dan perbedaannya harus disampaikan di
    CMS, bukan disembunyikan: menghapus cookie memberi suara kedua, sedangkan
    kode badge terikat pada baris `participants` yang nyata. Untuk voting yang
    menentukan hadiah hanya mode kedua yang layak.
  */
  voter_mode text not null default 'anonymous' check (voter_mode in ('anonymous', 'participant_code')),

  -- Hanya berarti pada type='multi'. Disimpan apa adanya pada 'single' supaya
  -- pertanyaan yang ditukar tipenya bolak-balik tidak kehilangan setelannya.
  max_choices integer not null default 1 check (max_choices between 1 and 20),

  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),

  /*
    Apakah hasil boleh dilihat.

    Terpisah dari `status` karena keduanya menjawab pertanyaan berbeda: voting
    bisa DIBUKA tanpa memperlihatkan hasil (mencegah efek ikut-ikutan), dan bisa
    DITUTUP dengan hasil masih disembunyikan sampai MC siap mengumumkannya.
    Menggabungkan keduanya menghilangkan salah satu dari dua momen itu.
  */
  results_visible boolean not null default false,

  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,

  -- Dirujuk FK komposit dari tabel anak, supaya opsi dan suara tidak pernah
  -- bisa menunjuk pertanyaan milik event lain.
  unique (event_id, id)
);

comment on table public.vote_polls is
  'Pertanyaan voting langsung. Satu event boleh punya banyak; yang tampil di layar ditentukan vote_state.';

-- ---------------------------------------------------------------------------
-- Opsi jawaban
-- ---------------------------------------------------------------------------
create table if not exists public.vote_options (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete restrict,
  poll_id bigint not null,
  label text not null,
  sort_order integer not null default 0,

  -- Lihat keputusan 1 di kepala berkas: ini yang dibaca layar, bukan count(*).
  vote_count integer not null default 0 check (vote_count >= 0),

  created_at timestamptz not null default now(),

  -- CASCADE, bukan SET NULL. FK komposit ber-`set null` akan mengosongkan
  -- `event_id` yang not null dan menolak seluruh transaksi dengan 23502 --
  -- jebakan yang sudah pernah menggagalkan penghapusan event di aplikasi ini.
  constraint vote_options_poll_same_event
    foreign key (event_id, poll_id) references public.vote_polls(event_id, id) on delete cascade,
  unique (event_id, id)
);

create index if not exists vote_options_poll_idx on public.vote_options (poll_id, sort_order);

-- ---------------------------------------------------------------------------
-- Suara
-- ---------------------------------------------------------------------------
create table if not exists public.vote_ballots (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete restrict,
  poll_id bigint not null,

  /*
    Kunci pemilih. Isinya tergantung mode:
      anonymous        -> 'dev:' + hash acak dari cookie perangkat
      participant_code -> 'pt:' + id peserta

    Disimpan sebagai teks tunggal dan bukan beberapa kolom nullable supaya
    indeks uniknya sederhana dan berlaku sama untuk semua mode. Prefiks menjaga
    dua mode tidak pernah bertabrakan kuncinya.
  */
  voter_key text not null,

  -- Diisi hanya pada mode yang mengenal pemilihnya. Dipakai panitia menjawab
  -- "siapa saja yang belum memilih", dan tidak pernah dikirim ke layar publik.
  participant_id uuid,
  display_name text,

  created_at timestamptz not null default now(),

  constraint vote_ballots_poll_same_event
    foreign key (event_id, poll_id) references public.vote_polls(event_id, id) on delete cascade,
  constraint vote_ballots_participant_same_event
    foreign key (event_id, participant_id) references public.participants(event_id, id) on delete set null,

  -- Keputusan 2 di kepala berkas.
  unique (poll_id, voter_key)
);

create index if not exists vote_ballots_poll_idx on public.vote_ballots (poll_id, created_at desc);
create index if not exists vote_ballots_participant_idx on public.vote_ballots (event_id, participant_id)
  where participant_id is not null;

-- Pilihan per suara. Tabel terpisah, bukan kolom array: pertanyaan pilihan
-- ganda punya banyak pilihan per suara, dan menghitung ulang penghitung dari
-- array berarti membongkar jsonb tiap kali. Baris di sini juga yang membuat
-- "hitung ulang dari nol" mungkin dilakukan tanpa menebak.
create table if not exists public.vote_ballot_choices (
  ballot_id bigint not null references public.vote_ballots(id) on delete cascade,
  option_id bigint not null references public.vote_options(id) on delete cascade,
  primary key (ballot_id, option_id)
);

create index if not exists vote_ballot_choices_option_idx on public.vote_ballot_choices (option_id);

-- ---------------------------------------------------------------------------
-- State runtime
--
-- Terpisah dari `vote_polls` dengan alasan yang sama seperti `undian_state`
-- dipisah dari `undian_settings`: menekan "tayangkan" tidak boleh menyentuh
-- `updated_at` pertanyaan maupun ikut terkirim dalam payload tombol Simpan CMS.
-- ---------------------------------------------------------------------------
create table if not exists public.vote_state (
  event_id uuid primary key references public.events(id) on delete cascade,
  active_poll_id bigint,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,

  constraint vote_state_poll_same_event
    foreign key (event_id, active_poll_id) references public.vote_polls(event_id, id) on delete set null
);

comment on table public.vote_state is
  'Pertanyaan yang sedang ditayangkan di layar panggung, satu baris per event.';

-- ---------------------------------------------------------------------------
-- Hak akses.
--
-- RLS menyala tanpa satu pun policy: seluruh akses lewat service role di route
-- handler yang sudah memeriksa sesi dan cakupan event. Halaman publik pun tidak
-- menyentuh tabel ini langsung -- ia memanggil route, dan route yang memanggil
-- RPC. Pola yang sama dipakai event_registrations.
-- ---------------------------------------------------------------------------
alter table public.vote_polls enable row level security;
alter table public.vote_options enable row level security;
alter table public.vote_ballots enable row level security;
alter table public.vote_ballot_choices enable row level security;
alter table public.vote_state enable row level security;

revoke all on table public.vote_polls from public, anon, authenticated;
revoke all on table public.vote_options from public, anon, authenticated;
revoke all on table public.vote_ballots from public, anon, authenticated;
revoke all on table public.vote_ballot_choices from public, anon, authenticated;
revoke all on table public.vote_state from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Catat satu suara.
--
-- Seluruh pekerjaan dalam SATU transaksi: penjaga, pencatatan, dan penaikan
-- penghitung. Dipecah menjadi beberapa panggilan dari route handler, kegagalan
-- di tengah meninggalkan suara tercatat tanpa penghitung naik -- dan angka di
-- layar diam-diam berhenti cocok dengan jumlah barisnya.
-- ---------------------------------------------------------------------------
create or replace function public.cast_vote(
  p_event_id uuid,
  p_poll_id bigint,
  p_voter_key text,
  p_option_ids bigint[],
  p_participant_id uuid default null,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  poll public.vote_polls;
  ballot_id bigint;
  n_options int;
  v_key text := nullif(btrim(coalesce(p_voter_key, '')), '');
begin
  if p_event_id is null or v_key is null then
    raise exception 'VOTE_INVALID_REQUEST';
  end if;

  select * into poll from public.vote_polls
   where id = p_poll_id and event_id = p_event_id;
  if poll.id is null then
    raise exception 'VOTE_POLL_NOT_FOUND';
  end if;
  if poll.status <> 'open' then
    raise exception 'VOTE_CLOSED';
  end if;

  -- Opsi dihitung dari tabel, bukan dari panjang array yang dikirim klien:
  -- array boleh memuat id ganda atau id milik pertanyaan lain, dan keduanya
  -- harus tertolak sebelum satu pun penghitung bergerak.
  select count(*) into n_options
    from public.vote_options
   where poll_id = p_poll_id and event_id = p_event_id
     and id = any (coalesce(p_option_ids, '{}'::bigint[]));

  if n_options = 0 then
    raise exception 'VOTE_NO_OPTION';
  end if;
  if n_options <> coalesce(array_length(p_option_ids, 1), 0) then
    raise exception 'VOTE_OPTION_INVALID';
  end if;
  if poll.type = 'single' and n_options > 1 then
    raise exception 'VOTE_TOO_MANY';
  end if;
  if poll.type = 'multi' and n_options > poll.max_choices then
    raise exception 'VOTE_TOO_MANY';
  end if;

  begin
    insert into public.vote_ballots (event_id, poll_id, voter_key, participant_id, display_name)
    values (p_event_id, p_poll_id, v_key, p_participant_id,
            nullif(btrim(coalesce(p_display_name, '')), ''))
    returning id into ballot_id;
  exception when unique_violation then
    -- Satu-satunya pelanggaran unik yang mungkin di sini adalah kunci pemilih.
    -- Ditangkap dan diterjemahkan supaya pemilih membaca "Anda sudah memilih",
    -- bukan galat server yang menyuruhnya mencoba lagi selamanya.
    raise exception 'VOTE_ALREADY_CAST';
  end;

  insert into public.vote_ballot_choices (ballot_id, option_id)
  select ballot_id, id from public.vote_options
   where poll_id = p_poll_id and event_id = p_event_id
     and id = any (p_option_ids);

  update public.vote_options
     set vote_count = vote_count + 1
   where poll_id = p_poll_id and event_id = p_event_id
     and id = any (p_option_ids);

  return jsonb_build_object(
    'ballot_id', ballot_id,
    'poll_id', p_poll_id,
    'choices', n_options
  );
end $$;

-- ---------------------------------------------------------------------------
-- Bangun ulang penghitung dari barisnya.
--
-- Ada supaya keputusan menyimpan penghitung tidak menjadi keputusan yang tak
-- dapat dibatalkan. Bila suatu saat angkanya diragukan -- baris dihapus manual,
-- atau bug pada jalur baru -- ini mengembalikannya ke kebenaran yang tersimpan
-- di `vote_ballot_choices`, tanpa perlu menebak.
-- ---------------------------------------------------------------------------
create or replace function public.recount_vote_poll(p_event_id uuid, p_poll_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hasil jsonb;
begin
  update public.vote_options o
     set vote_count = coalesce(c.jumlah, 0)
    from (
      select o2.id, count(bc.ballot_id) as jumlah
        from public.vote_options o2
        left join public.vote_ballot_choices bc on bc.option_id = o2.id
       where o2.poll_id = p_poll_id and o2.event_id = p_event_id
       group by o2.id
    ) c
   where o.id = c.id;

  select jsonb_agg(jsonb_build_object('option_id', id, 'vote_count', vote_count) order by sort_order)
    into hasil
    from public.vote_options
   where poll_id = p_poll_id and event_id = p_event_id;

  return coalesce(hasil, '[]'::jsonb);
end $$;

revoke all on function public.cast_vote(uuid, bigint, text, bigint[], uuid, text) from public, anon, authenticated;
grant execute on function public.cast_vote(uuid, bigint, text, bigint[], uuid, text) to service_role;

revoke all on function public.recount_vote_poll(uuid, bigint) from public, anon, authenticated;
grant execute on function public.recount_vote_poll(uuid, bigint) to service_role;
