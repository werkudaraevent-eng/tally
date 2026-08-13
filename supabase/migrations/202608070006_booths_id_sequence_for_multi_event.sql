-- Booth lama memberi id manual lewat admin_upsert_booth. Multi-event butuh insert
-- aman tanpa max(id)+1 yang race. Sequence mempertahankan id lama dan mulai max+1.
create sequence if not exists public.booths_id_seq owned by public.booths.id;
select setval('public.booths_id_seq',(select coalesce(max(id),0) from public.booths));
alter table public.booths alter column id set default nextval('public.booths_id_seq');
revoke all on sequence public.booths_id_seq from anon,authenticated;
