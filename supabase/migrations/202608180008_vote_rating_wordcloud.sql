-- ============================================================================
-- Voting fase 2-4: mode identitas baru, skala/rating, dan word cloud.
--
-- Tiga penambahan yang berbagi satu tulang punggung dari fase 1 -- `vote_polls`,
-- `vote_ballots`, dan indeks unik `(poll_id, voter_key)` tidak berubah bentuknya
-- sama sekali. Yang bertambah hanyalah cara satu suara DIISI dan cara hasilnya
-- DIRANGKUM.
--
-- KENAPA AGREGASI PINDAH KE SATU RPC.
--
-- Fase 1 merangkum hasil dengan satu select biasa: satu baris per opsi, angkanya
-- sudah tersimpan. Rating dan word cloud tidak bisa begitu -- yang satu butuh
-- rata-rata plus sebaran, yang lain butuh pengelompokan kata setelah
-- dinormalkan. Ditulis di TypeScript, tiga jenis rangkuman itu berarti tiga
-- jalur berbeda di route handler yang sama, masing-masing dengan query sendiri,
-- dan endpoint publik yang dibaca ratusan HP menjadi tempat paling buruk untuk
-- menaruh percabangan seperti itu.
--
-- `vote_public_state` mengembalikan payload yang SUDAH jadi, apa pun tipenya.
-- Route handler tinggal meneruskannya beserta header cache.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tipe dan mode identitas baru
-- ---------------------------------------------------------------------------
alter table public.vote_polls drop constraint if exists vote_polls_type_check;
alter table public.vote_polls
  add constraint vote_polls_type_check check (type in ('single', 'multi', 'rating', 'wordcloud'));

/*
  Mode identitas, lengkap.

  `participant_pick` dan `name_text` sengaja ditambahkan BELAKANGAN dan bukan
  sejak fase 1, karena keduanya bukan pengaman melainkan atribusi:

    participant_pick  peserta memilih namanya sendiri dari daftar. Siapa pun
                      bisa memilih nama orang lain. Suara ganda dicegah karena
                      satu nama hanya bisa dipakai sekali -- tetapi orang yang
                      salah bisa memakainya lebih dulu.
    name_text         peserta mengetik namanya. Sama sekali tidak diperiksa;
                      suara ganda dicegah lewat cookie perangkat, sama seperti
                      mode anonim.

  Keduanya berguna untuk jajak pendapat yang ingin tahu SIAPA yang menjawab
  tanpa membagikan badge. Untuk voting berhadiah, tetap hanya
  `participant_code` yang layak. Perbedaan ini ditulis di CMS di sebelah
  pilihannya.
*/
alter table public.vote_polls drop constraint if exists vote_polls_voter_mode_check;
alter table public.vote_polls
  add constraint vote_polls_voter_mode_check check (
    voter_mode in ('anonymous', 'participant_code', 'participant_pick', 'name_text')
  );

-- Setelan khusus rating.
alter table public.vote_polls
  add column if not exists rating_max integer not null default 5,
  add column if not exists rating_min_label text,
  add column if not exists rating_max_label text;

alter table public.vote_polls drop constraint if exists vote_polls_rating_max_check;
alter table public.vote_polls
  -- Selalu dimulai dari 1. Skala yang boleh dimulai dari nol menambah satu
  -- pilihan yang harus dijelaskan tanpa menjawab pertanyaan baru mana pun.
  add constraint vote_polls_rating_max_check check (rating_max between 2 and 10);

-- Setelan khusus word cloud.
alter table public.vote_polls
  add column if not exists moderation boolean not null default true,
  add column if not exists max_words integer not null default 3;

alter table public.vote_polls drop constraint if exists vote_polls_max_words_check;
alter table public.vote_polls
  add constraint vote_polls_max_words_check check (max_words between 1 and 5);

comment on column public.vote_polls.moderation is
  'Word cloud: bila true, kata baru tidak tampil di layar sampai disetujui operator.';

-- ---------------------------------------------------------------------------
-- 2. Isi suara untuk dua tipe baru
--
-- Kolom nullable pada `vote_ballots`, bukan tabel terpisah per tipe. Satu suara
-- tetap SATU BARIS apa pun tipenya, sehingga indeks unik `(poll_id, voter_key)`
-- terus menjadi satu-satunya penjaga suara ganda -- untuk keempat tipe
-- sekaligus, tanpa aturan tambahan yang bisa ketinggalan.
-- ---------------------------------------------------------------------------
alter table public.vote_ballots
  add column if not exists rating_value integer,
  add column if not exists text_value text,
  add column if not exists text_status text not null default 'approved';

alter table public.vote_ballots drop constraint if exists vote_ballots_text_status_check;
alter table public.vote_ballots
  add constraint vote_ballots_text_status_check check (text_status in ('pending', 'approved', 'rejected'));

create index if not exists vote_ballots_moderation_idx
  on public.vote_ballots (event_id, poll_id, created_at desc)
  where text_status = 'pending';

-- ---------------------------------------------------------------------------
-- 3. Penyaring kata
--
-- Tabel, bukan daftar di dalam fungsi: panitia menemukan kata baru yang perlu
-- disaring PADA HARI ACARA, dan menambahkannya lewat satu insert jauh lebih
-- cepat daripada menerbitkan migrasi baru di tengah acara.
--
-- Global, bukan per event: kata kasar tidak berubah antar-acara.
--
-- Daftar awal sengaja pendek dan hanya memuat yang paling gamblang. Penyaring
-- panjang menghasilkan penolakan yang membingungkan pengetiknya ("kenapa kata
-- biasa saya ditolak"), dan moderasi operator adalah lapisan yang sebenarnya
-- diandalkan.
-- ---------------------------------------------------------------------------
create table if not exists public.vote_blocked_words (
  word text primary key,
  created_at timestamptz not null default now()
);

alter table public.vote_blocked_words enable row level security;
revoke all on table public.vote_blocked_words from public, anon, authenticated;

insert into public.vote_blocked_words (word) values
  ('anjing'), ('bangsat'), ('bajingan'), ('kontol'), ('memek'), ('ngentot'),
  ('goblok'), ('tolol'), ('babi'), ('asu'), ('fuck'), ('shit'), ('bitch'), ('bastard')
on conflict (word) do nothing;

/**
 * Normalisasi satu kata: huruf kecil, tanpa tanda baca, spasi dirapatkan.
 *
 * Dipakai dua tempat -- penyaring saat suara masuk dan pengelompokan saat
 * dirangkum -- dan keduanya WAJIB memakai aturan yang sama. Kalau berbeda,
 * "Hebat!" dan "hebat" tampil sebagai dua kata terpisah di awan kata sementara
 * penyaringnya hanya mengenali salah satunya.
 */
create or replace function public.normalize_vote_word(p_word text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(lower(coalesce(p_word, '')), '[^a-z0-9 ]+', '', 'g')), '');
$$;

-- ---------------------------------------------------------------------------
-- 4. cast_vote, diperluas ke empat tipe
-- ---------------------------------------------------------------------------
create or replace function public.cast_vote(
  p_event_id uuid,
  p_poll_id bigint,
  p_voter_key text,
  p_option_ids bigint[],
  p_participant_id uuid default null,
  p_display_name text default null,
  p_rating integer default null,
  p_words text[] default null
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
  v_words text[] := '{}';
  v_word text;
  v_bersih text;
  v_status text := 'approved';
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

  -- ---- Rating -------------------------------------------------------------
  if poll.type = 'rating' then
    if p_rating is null or p_rating < 1 or p_rating > poll.rating_max then
      raise exception 'VOTE_RATING_INVALID';
    end if;

  -- ---- Word cloud ---------------------------------------------------------
  elsif poll.type = 'wordcloud' then
    if coalesce(array_length(p_words, 1), 0) = 0 then
      raise exception 'VOTE_NO_OPTION';
    end if;
    if array_length(p_words, 1) > poll.max_words then
      raise exception 'VOTE_TOO_MANY';
    end if;

    foreach v_word in array p_words loop
      v_bersih := public.normalize_vote_word(v_word);
      if v_bersih is null then continue; end if;
      if length(v_bersih) > 40 then
        raise exception 'VOTE_WORD_TOO_LONG';
      end if;
      -- Penyaring diterapkan per KATA hasil normalisasi, bukan pada kalimat
      -- utuh: pencocokan substring pada kalimat menolak "kasus" karena memuat
      -- "asu", dan penolakan seperti itu mustahil dijelaskan ke pengetiknya.
      if exists (select 1 from public.vote_blocked_words where word = v_bersih) then
        raise exception 'VOTE_TEXT_BLOCKED';
      end if;
      v_words := v_words || v_bersih;
    end loop;

    if coalesce(array_length(v_words, 1), 0) = 0 then
      raise exception 'VOTE_NO_OPTION';
    end if;
    if poll.moderation then v_status := 'pending'; end if;

  -- ---- Pilihan tunggal / ganda --------------------------------------------
  else
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
  end if;

  begin
    insert into public.vote_ballots (
      event_id, poll_id, voter_key, participant_id, display_name,
      rating_value, text_value, text_status
    )
    values (
      p_event_id, p_poll_id, v_key, p_participant_id,
      nullif(btrim(coalesce(p_display_name, '')), ''),
      case when poll.type = 'rating' then p_rating end,
      case when poll.type = 'wordcloud' then array_to_string(v_words, ' ') end,
      v_status
    )
    returning id into ballot_id;
  exception when unique_violation then
    raise exception 'VOTE_ALREADY_CAST';
  end;

  if poll.type in ('single', 'multi') then
    insert into public.vote_ballot_choices (ballot_id, option_id)
    select ballot_id, id from public.vote_options
     where poll_id = p_poll_id and event_id = p_event_id
       and id = any (p_option_ids);

    update public.vote_options
       set vote_count = vote_count + 1
     where poll_id = p_poll_id and event_id = p_event_id
       and id = any (p_option_ids);
  end if;

  return jsonb_build_object(
    'ballot_id', ballot_id,
    'poll_id', p_poll_id,
    'pending', v_status = 'pending'
  );
end $$;

-- ---------------------------------------------------------------------------
-- 5. Moderasi kata
-- ---------------------------------------------------------------------------
create or replace function public.moderate_vote_word(
  p_event_id uuid,
  p_ballot_id bigint,
  p_approve boolean,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text;
begin
  update public.vote_ballots
     set text_status = case when p_approve then 'approved' else 'rejected' end
   where id = p_ballot_id and event_id = p_event_id
  returning text_value into v_text;

  if v_text is null then
    raise exception 'VOTE_BALLOT_NOT_FOUND';
  end if;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor,
          case when p_approve then 'vote_word_approved' else 'vote_word_rejected' end,
          jsonb_build_object('ballot_id', p_ballot_id, 'text', v_text));

  return jsonb_build_object('ballot_id', p_ballot_id, 'approved', p_approve);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Payload publik, satu fungsi untuk keempat tipe
-- ---------------------------------------------------------------------------
create or replace function public.vote_public_state(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_poll_id bigint;
  poll public.vote_polls;
  v_total bigint := 0;
  v_hasil jsonb := 'null'::jsonb;
begin
  select active_poll_id into v_poll_id from public.vote_state where event_id = p_event_id;
  if v_poll_id is null then
    return jsonb_build_object('poll', null);
  end if;

  select * into poll from public.vote_polls where id = v_poll_id and event_id = p_event_id;
  if poll.id is null then
    return jsonb_build_object('poll', null);
  end if;

  -- Angka HANYA dihitung bila hasilnya memang boleh dilihat. Dihitung lalu
  -- disembunyikan komponen, ia tetap terkirim ke browser dan dapat dibaca
  -- siapa pun yang membuka panel jaringan.
  if poll.results_visible then
    select count(*) into v_total from public.vote_ballots
     where poll_id = poll.id and event_id = p_event_id
       and (poll.type <> 'wordcloud' or text_status = 'approved');

    if poll.type = 'rating' then
      select jsonb_build_object(
        'average', round(avg(rating_value)::numeric, 2),
        'distribution', (
          select coalesce(jsonb_agg(jsonb_build_object('value', nilai, 'count', jumlah) order by nilai), '[]'::jsonb)
          from (
            select skala.nilai, count(b.id) as jumlah
              from generate_series(1, poll.rating_max) as skala(nilai)
              left join public.vote_ballots b
                on b.poll_id = poll.id and b.event_id = p_event_id and b.rating_value = skala.nilai
             group by skala.nilai
          ) s
        )
      ) into v_hasil
      from public.vote_ballots
     where poll_id = poll.id and event_id = p_event_id;

    elsif poll.type = 'wordcloud' then
      -- Kata dipecah dari teks yang SUDAH dinormalkan saat disimpan, jadi di
      -- sini cukup dipisah spasi. Dibatasi 60 kata teratas: awan kata yang
      -- lebih padat tidak terbaca dari kursi belakang, dan payload-nya ikut
      -- membengkak di endpoint yang dipoll ratusan HP.
      select coalesce(jsonb_agg(jsonb_build_object('word', kata, 'count', jumlah) order by jumlah desc, kata), '[]'::jsonb)
        into v_hasil
      from (
        select kata, count(*) as jumlah
          from public.vote_ballots b,
               lateral unnest(string_to_array(b.text_value, ' ')) as kata
         where b.poll_id = poll.id and b.event_id = p_event_id
           and b.text_status = 'approved' and b.text_value is not null
         group by kata
         order by count(*) desc, kata
         limit 60
      ) s;
    end if;
  end if;

  return jsonb_build_object('poll', jsonb_build_object(
    'id', poll.id,
    'question', poll.question,
    'description', poll.description,
    'type', poll.type,
    'voter_mode', poll.voter_mode,
    'max_choices', poll.max_choices,
    'rating_max', poll.rating_max,
    'rating_min_label', poll.rating_min_label,
    'rating_max_label', poll.rating_max_label,
    'max_words', poll.max_words,
    'status', poll.status,
    'results_visible', poll.results_visible,
    'total_ballots', case when poll.results_visible then v_total else null end,
    'options', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'label', label,
        'vote_count', case when poll.results_visible then vote_count else null end
      ) order by sort_order, id), '[]'::jsonb)
      from public.vote_options where poll_id = poll.id and event_id = p_event_id
    ),
    'rating', case when poll.type = 'rating' and poll.results_visible then v_hasil end,
    'words', case when poll.type = 'wordcloud' and poll.results_visible then v_hasil end
  ));
end $$;

revoke all on function public.cast_vote(uuid, bigint, text, bigint[], uuid, text, integer, text[]) from public, anon, authenticated;
grant execute on function public.cast_vote(uuid, bigint, text, bigint[], uuid, text, integer, text[]) to service_role;

revoke all on function public.moderate_vote_word(uuid, bigint, boolean, uuid) from public, anon, authenticated;
grant execute on function public.moderate_vote_word(uuid, bigint, boolean, uuid) to service_role;

revoke all on function public.vote_public_state(uuid) from public, anon, authenticated;
grant execute on function public.vote_public_state(uuid) to service_role;

-- Tanda tangan lama `cast_vote` (enam argumen) dibuang supaya tidak ada dua
-- fungsi bernama sama: PostgREST memilih berdasarkan argumen yang dikirim, dan
-- route yang lupa mengirim dua argumen baru akan diam-diam memanggil versi lama
-- yang tidak mengenal rating maupun word cloud.
drop function if exists public.cast_vote(uuid, bigint, text, bigint[], uuid, text);
