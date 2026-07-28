-- Perbaikan: progress.visited memakai count(*) atas order berdiskon, bukan
-- jumlah booth yang berbeda. Karena discount_limit_per_participant kini dapat
-- diatur > 1 per booth, satu booth bisa menyumbang lebih dari satu hitungan
-- sehingga progress dapat melebihi total booth (mis. "8 dari 6 booth").
--
-- Selain itu progress kini menghitung kunjungan booth berdasarkan order lunas
-- APA PUN (bukan hanya yang mengambil item diskon), agar sesuai maksud spec
-- 7.1: "Progress peserta -- 3 dari 6 booth".
create or replace function public.get_participant_by_qr(p_qr_code text, p_booth_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  participant_row public.participants;
  booth_row public.booths;
  existing_orders jsonb;
  taken_here int;
  discount_order public.orders;
  booth_progress int;
  active_booths int;
begin
  select * into participant_row from public.participants where qr_code = trim(p_qr_code);
  if not found then raise exception using errcode = 'P0002', message = 'PARTICIPANT_NOT_FOUND'; end if;
  select * into booth_row from public.booths where id = p_booth_id and is_active = true;
  if not found then raise exception using errcode = 'P0003', message = 'BOOTH_NOT_FOUND'; end if;

  select jsonb_agg(to_jsonb(o) order by o.created_at desc) into existing_orders
    from public.orders o where o.participant_id = participant_row.id and o.booth_id = p_booth_id;

  select count(*) into taken_here from public.orders
    where participant_id = participant_row.id and booth_id = p_booth_id
      and has_discount_item = true and status <> 'void';

  select * into discount_order from public.orders
    where participant_id = participant_row.id and booth_id = p_booth_id
      and has_discount_item = true and status <> 'void'
    order by created_at desc limit 1;

  -- distinct booth_id: satu booth dihitung sekali walau ada beberapa order.
  select count(distinct booth_id) into booth_progress from public.orders
    where participant_id = participant_row.id and status in ('paid', 'handed_over');

  select count(*) into active_booths from public.booths where is_active = true;

  return jsonb_build_object(
    'participant', jsonb_build_object('id', participant_row.id, 'qr_code', participant_row.qr_code, 'name', participant_row.name, 'company', participant_row.company, 'title', participant_row.title, 'photo_url', participant_row.photo_url, 'allow_name_display', participant_row.allow_name_display),
    'discount_enabled', booth_row.discount_enabled and booth_row.discount_limit_per_participant > 0,
    'discount_limit', booth_row.discount_limit_per_participant,
    'discount_taken_here', taken_here,
    'discount_available', booth_row.discount_enabled and booth_row.discount_limit_per_participant > taken_here and (booth_row.discount_item_stock is null or booth_row.discount_item_stock > 0),
    'discount_taken_at', discount_order.created_at,
    'existing_orders_at_this_booth', coalesce(existing_orders, '[]'::jsonb),
    'progress', jsonb_build_object('visited', booth_progress, 'total', active_booths),
    'booth', jsonb_build_object('id', booth_row.id, 'code', booth_row.code, 'name', booth_row.name, 'discount_item_name', booth_row.discount_item_name, 'discount_item_price', booth_row.discount_item_price, 'discount_item_stock', booth_row.discount_item_stock, 'discount_enabled', booth_row.discount_enabled, 'discount_limit_per_participant', booth_row.discount_limit_per_participant)
  );
end;
$function$;

revoke all on function public.get_participant_by_qr(text, integer) from public, anon, authenticated;
grant execute on function public.get_participant_by_qr(text, integer) to service_role;
