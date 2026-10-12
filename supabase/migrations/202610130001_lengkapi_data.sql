-- ============================================================================
-- Lengkapi data: peserta mengisi atau mengubah jawabannya sendiri.
--
-- Admin menandai pertanyaan form dengan "Participants can update this"
-- (registration_form_config.fields[].participant_update, jsonb, tanpa SQL).
-- Peserta mengisinya di /e/<slug>/lengkapi, lewat tautan pribadi dari kiriman
-- "Update details link" atau dari kartu di dashboard bila sudah masuk.
--
-- Tiga perubahan, semuanya menambah, tidak ada yang dihapus:
--   1. participant_account_tokens.purpose menerima 'data' (tautan Lengkapi
--      data, berlaku 14 hari, boleh dibuka berkali-kali sampai kedaluwarsa).
--   2. message_blasts.kind menerima 'data' (kiriman Update details link).
--   3. update_participant_answers: menggabungkan jawaban ke participants.extra
--      dalam satu UPDATE, jadi suntingan admin yang terjadi bersamaan pada
--      pertanyaan lain tidak tertimpa. Hanya service role.
-- ============================================================================

begin;

set local lock_timeout = '5s';

-- 1. Tujuan tautan.
alter table public.participant_account_tokens
  drop constraint if exists participant_account_tokens_purpose_check;
alter table public.participant_account_tokens
  add constraint participant_account_tokens_purpose_check
  check (purpose in ('konfirmasi', 'sandi', 'undangan', 'data'));

-- 2. Jenis kiriman.
alter table public.message_blasts drop constraint if exists message_blasts_kind_check;
alter table public.message_blasts
  add constraint message_blasts_kind_check check (kind in ('undangan', 'info', 'invitation', 'data'));

-- 3. Simpan jawaban peserta.
--
-- p_answers: {kunci: teks} yang diisi; p_clear: kunci yang dikosongkan.
-- Kunci yang sah (hanya pertanyaan participant_update) diperiksa di route,
-- yang membaca konfigurasi form; di sini hanya bentuknya dijaga.
-- Mengembalikan false bila peserta tidak ada di acara itu atau sudah dihapus
-- dari sumbernya.
create or replace function public.update_participant_answers(
  p_event_id uuid,
  p_participant_id uuid,
  p_answers jsonb,
  p_clear text[] default '{}'::text[]
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'VALIDATION_ERROR';
  end if;

  update public.participants
     set extra = (coalesce(extra, '{}'::jsonb) - coalesce(p_clear, '{}'::text[])) || p_answers
   where id = p_participant_id
     and event_id = p_event_id
     and source_removed_at is null;
  v_found := found;

  if v_found then
    -- Hanya kuncinya yang dicatat, bukan isinya: alamat adalah data pribadi.
    insert into public.audit_logs (event_id, user_id, action, payload)
    values (
      p_event_id,
      null,
      'participant_self_update',
      jsonb_build_object(
        'participant_id', p_participant_id,
        'keys', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_object_keys(p_answers) as k),
        'cleared', to_jsonb(coalesce(p_clear, '{}'::text[]))
      )
    );
  end if;
  return v_found;
end;
$$;

revoke all on function public.update_participant_answers(uuid, uuid, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.update_participant_answers(uuid, uuid, jsonb, text[]) to service_role;

comment on function public.update_participant_answers(uuid, uuid, jsonb, text[]) is
  'Lengkapi data: gabungkan jawaban peserta ke participants.extra (service role saja).';

commit;

notify pgrst, 'reload schema';
