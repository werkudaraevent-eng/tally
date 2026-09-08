-- ---------------------------------------------------------------------------
-- Pencarian, penyaringan, dan paginasi daftar peserta, seluruhnya di database.
--
-- ---- Kenapa tidak cukup di route handler -----------------------------------
--
-- Dua penyaring yang paling dibutuhkan panitia tidak bisa ditulis lewat
-- PostgREST: "siapa yang BELUM hadir di sesi ini" dan "siapa yang mendaftar
-- sendiri". Keduanya menanyakan keberadaan baris di TABEL LAIN, dan satu-satunya
-- cara menjawabnya dari luar SQL adalah mengambil seluruh id yang cocok lalu
-- menempelkannya ke kueri berikutnya sebagai daftar.
--
-- Daftar itu tidak muat. Satu uuid 36 karakter; seribu peserta yang sudah hadir
-- menjadi URL 37 KB, sementara batas lazim sebuah server adalah 8 KB. Filter
-- yang bekerja pada acara berisi sepuluh orang lalu diam-diam salah pada acara
-- berisi seribu adalah yang paling mahal untuk ditemukan, karena ia ditemukan
-- di hari acara.
--
-- ---- Kenapa satu fungsi mengembalikan baris DAN totalnya -------------------
--
-- Paginasi butuh keduanya, dan keduanya harus berasal dari penyaring yang persis
-- sama. Dipisah menjadi dua kueri, setiap penyaring baru harus ditulis dua kali
-- dan cepat atau lambat salah satunya ketinggalan: nomor halaman mengatakan ada
-- 120 peserta sementara daftarnya hanya pernah menampilkan 30.
--
-- `count(*) over ()` dihitung Postgres SEBELUM LIMIT, jadi satu kueri sudah
-- cukup untuk menjawab keduanya.
-- ---------------------------------------------------------------------------

create or replace function public.list_event_participants(
  p_event_id uuid,
  p_q text default '',
  -- walkin | scanner | registration | manual
  p_source text default null,
  p_session bigint default null,
  -- yes | no. Diabaikan bila p_session kosong: "belum hadir" tanpa menyebut di
  -- sesi mana bukan pertanyaan yang punya jawaban.
  p_attended text default null,
  -- invited | confirmed | none
  p_rsvp text default null,
  p_sort text default 'name',
  p_dir text default 'asc',
  p_limit int default 25,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sort text;
  v_dir text;
  v_rows jsonb;
  v_total int;
begin
  -- Nama kolom TIDAK pernah datang mentah dari permintaan. Ia dipetakan lewat
  -- daftar putih di sini, dan hanya hasil pemetaan itu yang masuk ke format()
  -- sebagai pengenal. Route handler memvalidasinya juga; keduanya ada karena
  -- fungsi ini bisa dipanggil dari mana saja di masa depan.
  v_sort := case p_sort
    when 'company' then 'company'
    when 'title' then 'title'
    when 'qr_code' then 'qr_code'
    when 'participant_type' then 'participant_type'
    when 'rsvp_status' then 'rsvp_status'
    when 'source_checked_in' then 'source_checked_in'
    when 'source_total_scans' then 'source_total_scans'
    else 'name'
  end;
  v_dir := case when lower(coalesce(p_dir, 'asc')) = 'desc' then 'DESC' else 'ASC' end;

  execute format($sql$
    with dasar as (
      select p.id, p.qr_code, p.name, p.company, p.title, p.email, p.phone,
             p.participant_type, p.rsvp_status, p.extra, p.source_participant_id,
             p.source_checked_in, p.source_total_scans, p.source_synced_at,
             p.source_removed_at, p.walk_in_at, p.seats,
             -- Asal baris, satu nilai yang saling meniadakan. Urutannya bukan
             -- selera: tamu walk-in tidak pernah datang dari Scanner API maupun
             -- dari formulir, jadi penanda paling spesifik menang lebih dulu.
             case
               when p.walk_in_at is not null then 'walkin'
               when p.source_participant_id is not null then 'scanner'
               when exists (
                 select 1 from public.event_registrations r
                  where r.event_id = p.event_id and r.participant_id = p.id
               ) then 'registration'
               else 'manual'
             end as source
        from public.participants p
       where p.event_id = $1::uuid
    ),
    disaring as (
      select * from dasar d
       where (
               $2::text = ''
               or d.name ilike '%%' || $2::text || '%%'
               or d.qr_code ilike '%%' || $2::text || '%%'
               or coalesce(d.company, '') ilike '%%' || $2::text || '%%'
             )
         and ($3::text is null or d.source = $3::text)
         and (
               $6::text is null
               or ($6::text = 'none' and d.rsvp_status is null)
               or d.rsvp_status = $6::text
             )
         and (
               $4::bigint is null or $5::text is null
               or ($5::text = 'yes' and exists (
                     select 1 from public.attendance_scans s
                      where s.session_id = $4::bigint and s.participant_id = d.id))
               or ($5::text = 'no' and not exists (
                     select 1 from public.attendance_scans s
                      where s.session_id = $4::bigint and s.participant_id = d.id))
             )
    )
    select coalesce(jsonb_agg(halaman.isi order by halaman.urut), '[]'::jsonb),
           coalesce(max(halaman.total), 0)
      from (
        select to_jsonb(d) || jsonb_build_object(
                 -- Kehadiran menurut catatan APLIKASI INI, per sesi. Subkueri
                 -- berkorelasi, dan itu murah: ia hanya berjalan untuk baris yang
                 -- sudah lolos LIMIT, yaitu dua puluh lima.
                 'attendance',
                 coalesce((
                   select jsonb_object_agg(a.session_id::text,
                            jsonb_build_object('count', a.n, 'first', a.f))
                     from (select s.session_id, count(*) as n, min(s.scanned_at) as f
                             from public.attendance_scans s
                            where s.participant_id = d.id
                            group by s.session_id) a
                 ), '{}'::jsonb)
               ) as isi,
               row_number() over (order by d.%I %s nulls last, d.name asc) as urut,
               count(*) over () as total
          from disaring d
         order by d.%I %s nulls last, d.name asc
         limit $7::int offset $8::int
      ) halaman
  $sql$, v_sort, v_dir, v_sort, v_dir)
  using p_event_id, coalesce(p_q, ''), p_source, p_session, p_attended, p_rsvp, p_limit, p_offset
  into v_rows, v_total;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

revoke all on function public.list_event_participants(uuid, text, text, bigint, text, text, text, text, int, int)
  from public, anon, authenticated;
grant execute on function public.list_event_participants(uuid, text, text, bigint, text, text, text, text, int, int)
  to service_role;
