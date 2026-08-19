-- ============================================================================
-- Reset suara satu pertanyaan (P12).
--
-- Dipakai setelah gladi bersih: pertanyaan yang sama diuji lebih dulu dengan
-- beberapa suara panitia, lalu dikosongkan sebelum acara sungguhan. Tanpa ini,
-- satu-satunya jalan adalah menghapus pertanyaan dan menyusun ulang seluruh
-- opsinya — termasuk mengunggah ulang foto tiap kandidat.
--
-- SATU RPC, bukan rangkaian delete dari route handler. Menghapus suara berarti
-- menyentuh tiga tempat: baris suara, baris pilihan, dan penghitung di opsi.
-- Lewat klien Supabase itu tiga permintaan HTTP terpisah, dan gagal di tengah
-- meninggalkan penghitung yang tidak lagi cocok dengan barisnya — angka di layar
-- panggung berhenti berhubungan dengan apa pun, dan tidak ada yang menyadarinya
-- sampai seseorang membandingkannya.
--
-- Yang TIDAK ikut direset: status pertanyaan dan `results_visible`. Keduanya
-- keputusan operator tentang APA YANG SEDANG TERJADI di panggung, bukan bagian
-- dari datanya. Mengembalikannya diam-diam ke bawaan akan menutup voting yang
-- sedang dibuka, tepat setelah operator menekan tombol yang ia kira hanya
-- membersihkan angka.
-- ============================================================================

create or replace function public.reset_vote_poll(
  p_event_id uuid,
  p_poll_id bigint,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  poll public.vote_polls;
  n_ballots bigint;
begin
  select * into poll from public.vote_polls
   where id = p_poll_id and event_id = p_event_id for update;
  if poll.id is null then
    raise exception 'VOTE_POLL_NOT_FOUND';
  end if;

  -- Dihitung SEBELUM dihapus. Angka ini dikembalikan ke pemanggil dan ikut masuk
  -- log, sehingga "kok suaranya hilang" bisa dijawab dengan berapa yang
  -- sebenarnya terbuang dan oleh siapa -- bukan dengan tebakan berbulan kemudian.
  select count(*) into n_ballots from public.vote_ballots
   where poll_id = p_poll_id and event_id = p_event_id;

  -- `vote_ballot_choices` ikut CASCADE dari `vote_ballots`, jadi tidak disebut
  -- di sini: menghapusnya lebih dulu hanya mengulang pekerjaan yang sudah
  -- dijamin database.
  delete from public.vote_ballots where poll_id = p_poll_id and event_id = p_event_id;

  update public.vote_options set vote_count = 0
   where poll_id = p_poll_id and event_id = p_event_id;

  insert into public.audit_logs (event_id, user_id, action, payload)
  values (p_event_id, p_actor, 'vote_poll_reset',
          jsonb_build_object('poll_id', p_poll_id, 'question', poll.question,
                             'ballots_deleted', n_ballots));

  return jsonb_build_object('poll_id', p_poll_id, 'ballots_deleted', n_ballots);
end $$;

revoke all on function public.reset_vote_poll(uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.reset_vote_poll(uuid, bigint, uuid) to service_role;
