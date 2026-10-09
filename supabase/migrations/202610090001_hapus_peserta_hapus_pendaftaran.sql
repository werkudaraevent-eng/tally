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
-- sama. Jejaknya pindah ke audit_logs (registrations: id + email, dan
-- invitation_ids, di payload participant_deleted). Yang ikut hilang lewat FK: participant_accounts dan
-- participant_account_tokens (cascade), registration_uploads (cascade).
-- Berkas di bucket registration-uploads tidak ikut terhapus.
--
-- Undangan yang menunjuk pendaftaran atau peserta itu dikembalikan ke "Belum
-- daftar" (registered_at, registration_id, participant_id null) dan tautan
-- lamanya dimatikan dengan nonce baru, sama dengan Buat tautan baru. Tanpa itu
-- tamu acara khusus undangan tetap kena INVITATION_USED, dan Buat tautan baru
-- menolaknya karena registered_at masih terisi. Tamu perlu dikirimi tautan baru.
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
  regs jsonb;
  inv_ids uuid[];
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

  -- Undangan dulu, selagi registration_id-nya masih menunjuk pendaftaran.
  with buka as (
    update public.event_invitations i
       set registered_at = null, registration_id = null, participant_id = null,
           link_nonce = replace(gen_random_uuid()::text, '-', ''), link_opened_at = null,
           updated_at = now()
     where i.event_id = p_event_id
       and (i.participant_id = p_id
            or i.registration_id in (select r.id from public.event_registrations r
                                      where r.event_id = p_event_id and r.participant_id = p_id))
    returning i.id
  )
  select coalesce(array_agg(id), '{}') into inv_ids from buka;

  -- Lalu pendaftarannya, supaya FK set null tidak sempat menyisakan baris
  -- 'approved' tanpa peserta yang tetap memegang emailnya.
  with hapus as (
    delete from public.event_registrations
     where event_id = p_event_id and participant_id = p_id
    returning id, email
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'email', email)), '[]') into regs from hapus;

  -- leaderboard_exclusions dan undian_exclusions ikut CASCADE.
  delete from public.participants where id = p_id and event_id = p_event_id;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'participant_deleted',
          jsonb_build_object('participant_id', p_id, 'qr_code', row_.qr_code, 'name', row_.name,
                             'registrations', regs, 'invitation_ids', to_jsonb(inv_ids)));

  return jsonb_build_object('id', p_id, 'qr_code', row_.qr_code, 'name', row_.name,
                            'registrations_deleted', jsonb_array_length(regs),
                            'invitations_reopened', coalesce(array_length(inv_ids, 1), 0));
end $$;

revoke all on function public.delete_participant(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_participant(uuid, uuid, uuid) to service_role;
