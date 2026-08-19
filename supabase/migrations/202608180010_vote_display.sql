-- ============================================================================
-- Tampilan panggung voting: judul, warna, latar, branding — dan gambar per opsi.
--
-- KENAPA TABEL SENDIRI, bukan menumpang `undian_settings`.
--
-- Sampai sekarang layar voting meminjam warna dari setelan undian. Itu keputusan
-- yang benar saat layar voting belum punya CMS: dua layar di proyektor yang sama
-- pada acara yang sama sebaiknya tidak berbeda rupa, dan meminjam lebih baik
-- daripada memaksa panitia mengisi warna dua kali.
--
-- Begitu voting punya judul, logo, dan footer sendiri, meminjam berhenti masuk
-- akal: judul layar undian ("Undian Berhadiah") tidak pernah cocok untuk sesi
-- voting, dan menaruh dua judul di satu tabel setelan undian membuat tabel itu
-- melayani dua layar yang tidak berhubungan.
--
-- Bentuk kolomnya SENGAJA identik dengan `display_settings` dan
-- `seat_map_sessions` — nama yang sama persis untuk bagian branding. Itulah yang
-- membuat satu `normalizeBranding` dan satu `<BrandingEditor>` melayani
-- semuanya; bentuk yang berbeda berarti setiap penambahan field kelak dikerjakan
-- empat kali, dan begitu satu terlewat, layar-layar di ruangan yang sama tampil
-- dengan aturan berbeda.
-- ============================================================================

create table if not exists public.vote_settings (
  event_id uuid primary key references public.events(id) on delete cascade,

  page_title text not null default 'Voting',
  page_subtitle text,

  -- Warna dibiarkan NULL secara bawaan, bukan diisi nilai bawaan. NULL berarti
  -- "pakai bawaan layar"; nilai terisi berarti panitia benar-benar memilihnya.
  -- Tanpa perbedaan itu, mustahil tahu apakah warna gelap adalah pilihan sadar
  -- atau sekadar nilai yang tidak pernah disentuh.
  background_color text,
  text_color text,
  accent_color text,
  background_image_url text,

  logo_url text,
  logo_scale numeric(3,2) not null default 1.00,
  footer_image_url text,
  footer_image_scale numeric(3,2) not null default 1.00,
  footer_text text,
  heading_font public.branding_font not null default 'sans',
  title_scale numeric(3,2) not null default 1.00,
  subtitle_scale numeric(3,2) not null default 1.00,
  footer_scale numeric(3,2) not null default 1.00,
  title_color text,
  subtitle_color text,
  footer_text_color text,

  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

alter table public.vote_settings drop constraint if exists vote_settings_scale_range;
alter table public.vote_settings
  add constraint vote_settings_scale_range check (
    logo_scale between 0.50 and 2.00
    and footer_image_scale between 0.50 and 2.00
    and title_scale between 0.50 and 2.00
    and subtitle_scale between 0.50 and 2.00
    and footer_scale between 0.50 and 2.00
  );

alter table public.vote_settings enable row level security;
revoke all on table public.vote_settings from public, anon, authenticated;

comment on table public.vote_settings is
  'Tampilan layar panggung voting, satu baris per event. Kolom branding sengaja senama dengan display_settings agar komponen editor dan normalisasinya dipakai bersama.';

-- ---------------------------------------------------------------------------
-- Gambar per opsi.
--
-- Untuk voting "pilih desain", "pilih foto terbaik", atau pemilihan kandidat
-- berfoto. Nullable dan tanpa nilai bawaan: sebagian besar pertanyaan tidak
-- memakainya, dan opsi tanpa gambar harus tetap tampil rapi berdampingan dengan
-- yang bergambar.
-- ---------------------------------------------------------------------------
alter table public.vote_options
  add column if not exists image_url text;

-- ---------------------------------------------------------------------------
-- save_vote_poll: opsi kini membawa `image_url`.
--
-- Hanya bagian opsi yang berubah dari 202608180009; selebihnya identik. Ditulis
-- utuh karena `create or replace function` memang mengganti seluruh badan.
-- ---------------------------------------------------------------------------
create or replace function public.save_vote_poll(
  p_event_id uuid,
  p_id bigint,
  p_question text,
  p_description text,
  p_type text,
  p_voter_mode text,
  p_max_choices integer,
  p_options jsonb,
  p_actor uuid default null,
  p_rating_max integer default 5,
  p_rating_min_label text default null,
  p_rating_max_label text default null,
  p_moderation boolean default true,
  p_max_words integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lama public.vote_polls;
  v_poll_id bigint;
  v_ballots bigint := 0;
  v_item jsonb;
  v_urutan int := 0;
  v_dikirim bigint[] := '{}';
  v_baru bigint;
  v_question text := nullif(btrim(coalesce(p_question, '')), '');
  v_hapus int := 0;
  v_type text := coalesce(p_type, 'single');
  v_butuh_opsi boolean := v_type in ('single', 'multi');
begin
  if p_event_id is null then
    raise exception using errcode='P0009', message='EVENT_REQUIRED';
  end if;
  if v_question is null then
    raise exception 'VOTE_QUESTION_REQUIRED';
  end if;

  if v_butuh_opsi then
    if coalesce(jsonb_array_length(coalesce(p_options, '[]'::jsonb)), 0) < 2 then
      raise exception 'VOTE_NEED_TWO_OPTIONS';
    end if;
    if jsonb_array_length(p_options) > 30 then
      raise exception 'VOTE_TOO_MANY_OPTIONS';
    end if;
  end if;

  if p_id is not null then
    select * into v_lama from public.vote_polls
     where id = p_id and event_id = p_event_id for update;
    if v_lama.id is null then
      raise exception 'VOTE_POLL_NOT_FOUND';
    end if;
    select count(*) into v_ballots from public.vote_ballots where poll_id = p_id;
  end if;

  if v_ballots > 0 and (
       v_type is distinct from v_lama.type
    or p_voter_mode is distinct from v_lama.voter_mode
    or p_max_choices is distinct from v_lama.max_choices
    or p_rating_max is distinct from v_lama.rating_max
  ) then
    raise exception 'VOTE_HAS_BALLOTS';
  end if;

  if p_id is null then
    insert into public.vote_polls (
      event_id, question, description, type, voter_mode, max_choices, created_by,
      rating_max, rating_min_label, rating_max_label, moderation, max_words
    )
    values (
      p_event_id, v_question, nullif(btrim(coalesce(p_description, '')), ''),
      v_type, coalesce(p_voter_mode, 'anonymous'), coalesce(p_max_choices, 1), p_actor,
      coalesce(p_rating_max, 5), nullif(btrim(coalesce(p_rating_min_label, '')), ''),
      nullif(btrim(coalesce(p_rating_max_label, '')), ''),
      coalesce(p_moderation, true), coalesce(p_max_words, 3)
    )
    returning id into v_poll_id;
  else
    v_poll_id := p_id;
    update public.vote_polls
       set question = v_question,
           description = nullif(btrim(coalesce(p_description, '')), ''),
           type = v_type,
           voter_mode = coalesce(p_voter_mode, voter_mode),
           max_choices = coalesce(p_max_choices, max_choices),
           rating_max = coalesce(p_rating_max, rating_max),
           rating_min_label = nullif(btrim(coalesce(p_rating_min_label, '')), ''),
           rating_max_label = nullif(btrim(coalesce(p_rating_max_label, '')), ''),
           moderation = coalesce(p_moderation, moderation),
           max_words = coalesce(p_max_words, max_words),
           updated_at = now()
     where id = v_poll_id and event_id = p_event_id;
  end if;

  if v_butuh_opsi then
    for v_item in select * from jsonb_array_elements(p_options) loop
      v_urutan := v_urutan + 1;
      if nullif(btrim(coalesce(v_item->>'label', '')), '') is null then
        raise exception 'VOTE_OPTION_LABEL_REQUIRED';
      end if;

      if (v_item->>'id') is not null then
        update public.vote_options
           set label = btrim(v_item->>'label'),
               sort_order = v_urutan,
               image_url = nullif(btrim(coalesce(v_item->>'image_url', '')), '')
         where id = (v_item->>'id')::bigint
           and poll_id = v_poll_id and event_id = p_event_id;
        v_dikirim := v_dikirim || (v_item->>'id')::bigint;
      else
        if v_ballots > 0 then
          raise exception 'VOTE_HAS_BALLOTS';
        end if;
        insert into public.vote_options (event_id, poll_id, label, sort_order, image_url)
        values (p_event_id, v_poll_id, btrim(v_item->>'label'), v_urutan,
                nullif(btrim(coalesce(v_item->>'image_url', '')), ''))
        returning id into v_baru;
        v_dikirim := v_dikirim || v_baru;
      end if;
    end loop;
  end if;

  select count(*) into v_hapus from public.vote_options
   where poll_id = v_poll_id and event_id = p_event_id and id <> all (v_dikirim);

  if v_hapus > 0 then
    if v_ballots > 0 then
      raise exception 'VOTE_HAS_BALLOTS';
    end if;
    delete from public.vote_options
     where poll_id = v_poll_id and event_id = p_event_id and id <> all (v_dikirim);
  end if;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor,
          case when p_id is null then 'vote_poll_created' else 'vote_poll_updated' end,
          jsonb_build_object('poll_id', v_poll_id, 'question', v_question, 'type', v_type, 'ballots', v_ballots));

  return jsonb_build_object('poll_id', v_poll_id, 'ballots', v_ballots);
end $$;

revoke all on function public.save_vote_poll(uuid, bigint, text, text, text, text, integer, jsonb, uuid, integer, text, text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.save_vote_poll(uuid, bigint, text, text, text, text, integer, jsonb, uuid, integer, text, text, boolean, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- vote_public_state: opsi membawa gambar.
--
-- `image_url` dikirim TANPA memandang `results_visible`, berbeda dari
-- `vote_count`. Gambar adalah bagian dari PERTANYAAN — pemilih harus melihatnya
-- untuk bisa memilih — sedangkan angka adalah HASIL yang boleh ditahan.
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
        'id', id, 'label', label, 'image_url', image_url,
        'vote_count', case when poll.results_visible then vote_count else null end
      ) order by sort_order, id), '[]'::jsonb)
      from public.vote_options where poll_id = poll.id and event_id = p_event_id
    ),
    'rating', case when poll.type = 'rating' and poll.results_visible then v_hasil end,
    'words', case when poll.type = 'wordcloud' and poll.results_visible then v_hasil end
  ));
end $$;

revoke all on function public.vote_public_state(uuid) from public, anon, authenticated;
grant execute on function public.vote_public_state(uuid) to service_role;
