-- ---------------------------------------------------------------------------
-- Hapus peserta = hapus pendaftarannya juga.
--
-- Sebelumnya delete_participant hanya menghapus baris `participants`;
-- event_registrations.participant_id di-set null dan pendaftarannya tetap
-- berstatus 'approved'. Akibatnya:
--   * tab Registration > Approved masih menampilkan orang yang sudah dihapus,
--     tanpa kode peserta;
--   * indeks event_registrations_email_unique (where status <> 'rejected')
--     tetap memegang emailnya, jadi orang itu tidak bisa mendaftar ulang
--     (REGISTRATION_DUPLICATE_EMAIL).
--
-- Kini pendaftaran yang menunjuk peserta itu ikut dihapus dalam transaksi yang
-- sama. Jejaknya pindah ke audit_logs (registration_ids di payload
-- participant_deleted). Yang ikut hilang lewat FK: participant_accounts dan
-- participant_account_tokens (cascade), registration_uploads (cascade).
-- event_invitations.registration_id di-set null; registered_at tetap terisi,
-- jadi tautan undangan yang sudah dipakai tidak hidup lagi.
--
-- admin_reset_records tidak diubah: reset massal tetap menyimpan pendaftaran.
--
-- Tanpa indeks baru: filter event_id memakai event_registrations_event_status_idx,
-- jadi yang dipindai hanya pendaftaran satu acara.
-- ---------------------------------------------------------------------------
set lock_timeout = '5s';

create or replace function public.delete_participant(
  p_event_id uuid,
  p_id uuid,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_ public.participants;
  reg_ids uuid[];
begin
  select * into row_ from public.participants
   where id = p_id and event_id = p_event_id for update;
  if row_.id is null then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;
  if row_.source_participant_id is not null then
    raise exception 'PARTICIPANT_SOURCE_LOCKED';
  end if;
  if exists (select 1 from public.orders where event_id = p_event_id and participant_id = p_id)
     or exists (select 1 from public.undian_winners where event_id = p_event_id and participant_id = p_id) then
    raise exception 'PARTICIPANT_IN_USE';
  end if;

  -- Pendaftaran dulu, supaya FK set null tidak sempat menyisakan baris
  -- 'approved' tanpa peserta yang tetap memegang emailnya.
  with hapus as (
    delete from public.event_registrations
     where event_id = p_event_id and participant_id = p_id
    returning id
  )
  select coalesce(array_agg(id), '{}') into reg_ids from hapus;

  -- leaderboard_exclusions dan undian_exclusions ikut CASCADE.
  delete from public.participants where id = p_id and event_id = p_event_id;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'participant_deleted',
          jsonb_build_object('participant_id', p_id, 'qr_code', row_.qr_code, 'name', row_.name,
                             'registration_ids', to_jsonb(reg_ids)));

  return jsonb_build_object('id', p_id, 'qr_code', row_.qr_code, 'name', row_.name,
                            'registrations_deleted', coalesce(array_length(reg_ids, 1), 0));
end $$;

revoke all on function public.delete_participant(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_participant(uuid, uuid, uuid) to service_role;
