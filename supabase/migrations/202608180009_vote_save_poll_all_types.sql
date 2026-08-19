-- ============================================================================
-- save_vote_poll diperluas ke empat tipe (lanjutan 202608180008).
--
-- Rating dan word cloud TIDAK punya opsi, jadi penjaga "minimal dua opsi" hanya
-- berlaku untuk single/multi. Tanpa pemisahan ini, menyimpan pertanyaan rating
-- selalu ditolak dengan galat tentang opsi yang memang tidak pernah ada.
--
-- Skala rating ikut dikunci setelah ada suara: mengubah maksimum dari 5 ke 10
-- di tengah jalan membuat suara lama dan baru tidak lagi berada di skala yang
-- sama, dan rata-ratanya berhenti punya arti.
--
-- Tanda tangan lama (sembilan argumen) dibuang di akhir supaya PostgREST tidak
-- punya dua kandidat untuk nama yang sama.
-- ============================================================================

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
           set label = btrim(v_item->>'label'), sort_order = v_urutan
         where id = (v_item->>'id')::bigint
           and poll_id = v_poll_id and event_id = p_event_id;
        v_dikirim := v_dikirim || (v_item->>'id')::bigint;
      else
        if v_ballots > 0 then
          raise exception 'VOTE_HAS_BALLOTS';
        end if;
        insert into public.vote_options (event_id, poll_id, label, sort_order)
        values (p_event_id, v_poll_id, btrim(v_item->>'label'), v_urutan)
        returning id into v_baru;
        v_dikirim := v_dikirim || v_baru;
      end if;
    end loop;
  end if;

  -- Berlaku juga saat tipe DIUBAH menjadi rating/wordcloud: opsi lama tidak
  -- ikut dikirim, jadi terhapus di sini. Dengan suara yang sudah masuk,
  -- perubahan tipe sudah tertolak lebih dulu di atas.
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

drop function if exists public.save_vote_poll(uuid, bigint, text, text, text, text, integer, jsonb, uuid);
