-- ============================================================================
-- Simpan pertanyaan voting beserta opsinya, dalam satu transaksi (P10 fase 1).
--
-- Satu RPC dan bukan beberapa `.upsert()` dari route handler, karena menyimpan
-- pertanyaan berarti menulis ke DUA tabel: baris pertanyaan dan seluruh
-- opsinya. Lewat klien Supabase itu jadi beberapa permintaan HTTP terpisah, dan
-- gagal di tengah meninggalkan pertanyaan dengan separuh opsi -- keadaan yang
-- tidak diwakili status mana pun dan baru terlihat saat ditayangkan.
--
-- PENJAGA TERHADAP SUARA YANG SUDAH MASUK.
--
-- Begitu satu suara tercatat, mengubah daftar opsi berarti mengubah arti angka
-- yang sudah terkumpul: menghapus opsi membuang suara yang sah, menambah opsi
-- memberi kandidat baru start dari nol di tengah pertandingan, dan menukar tipe
-- pertanyaan mengubah aturan penghitungan setelah orang memilih.
--
-- Yang TETAP boleh diubah setelah ada suara hanyalah teks: pertanyaan,
-- keterangan, dan label opsi. Salah ketik nama kandidat harus bisa dibetulkan
-- di tengah acara tanpa membuang suara yang sudah masuk.
--
-- CATATAN PENAMAAN: seluruh variabel diawali `v_`. Variabel plpgsql bernama
-- sama dengan kolom (`poll_id`) membuat `where poll_id = poll_id` ambigu, dan
-- Postgres menolaknya saat fungsi dijalankan -- bukan saat dibuat, sehingga
-- kesalahan itu baru muncul pada penyimpanan pertama.
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
  p_actor uuid default null
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
begin
  if p_event_id is null then
    raise exception using errcode='P0009', message='EVENT_REQUIRED';
  end if;
  if v_question is null then
    raise exception 'VOTE_QUESTION_REQUIRED';
  end if;
  -- Dua opsi adalah batas terendah yang masih berupa pilihan. Satu opsi bukan
  -- voting, dan kesalahan itu paling sering muncul karena baris kedua lupa
  -- diisi, bukan karena disengaja.
  if coalesce(jsonb_array_length(coalesce(p_options, '[]'::jsonb)), 0) < 2 then
    raise exception 'VOTE_NEED_TWO_OPTIONS';
  end if;
  if jsonb_array_length(p_options) > 30 then
    raise exception 'VOTE_TOO_MANY_OPTIONS';
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
       p_type is distinct from v_lama.type
    or p_voter_mode is distinct from v_lama.voter_mode
    or p_max_choices is distinct from v_lama.max_choices
  ) then
    raise exception 'VOTE_HAS_BALLOTS';
  end if;

  if p_id is null then
    insert into public.vote_polls (event_id, question, description, type, voter_mode, max_choices, created_by)
    values (p_event_id, v_question, nullif(btrim(coalesce(p_description, '')), ''),
            coalesce(p_type, 'single'), coalesce(p_voter_mode, 'anonymous'),
            coalesce(p_max_choices, 1), p_actor)
    returning id into v_poll_id;
  else
    v_poll_id := p_id;
    update public.vote_polls
       set question = v_question,
           description = nullif(btrim(coalesce(p_description, '')), ''),
           type = coalesce(p_type, type),
           voter_mode = coalesce(p_voter_mode, voter_mode),
           max_choices = coalesce(p_max_choices, max_choices),
           updated_at = now()
     where id = v_poll_id and event_id = p_event_id;
  end if;

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
      -- Id opsi baru WAJIB ikut dikumpulkan. Tanpa ini, daftar "yang dikirim"
      -- kosong pada pertanyaan baru, dan penghapusan di bawah membuang seluruh
      -- opsi yang baru saja disisipkan.
      returning id into v_baru;
      v_dikirim := v_dikirim || v_baru;
    end if;
  end loop;

  -- Opsi yang tidak ikut dikirim berarti dihapus. Dengan suara yang sudah
  -- masuk, penghapusan ditolak: angka di opsi itu adalah suara sah milik orang
  -- yang sudah memilih.
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
          jsonb_build_object('poll_id', v_poll_id, 'question', v_question, 'ballots', v_ballots));

  return jsonb_build_object('poll_id', v_poll_id, 'ballots', v_ballots);
end $$;

revoke all on function public.save_vote_poll(uuid, bigint, text, text, text, text, integer, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.save_vote_poll(uuid, bigint, text, text, text, text, integer, jsonb, uuid)
  to service_role;
