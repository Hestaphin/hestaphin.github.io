-- COPKU orchestra project only. Additive instrument inventory classification.
alter table public.portal_booking_resources
 add column if not exists instrument_classification text
 constraint portal_booking_instrument_class_check check (
  instrument_classification is null or
  (category='Instrument' and instrument_classification in ('strings','woodwind','brasswind','keyboard','percussion','others'))
 );

-- Older clients keep using v135 and preserve this field. A v140 save explicitly
-- sets a valid classification, retaining the existing row lock, stale-write,
-- category, media ownership, clearance validation and audit transaction.
create or replace function public.portal_booking_save_resource_v140(
 p_actor uuid,p_id uuid,p_name text,p_category text,p_description text,p_clearance jsonb,
 p_expected_updated_at timestamptz,p_resource_code text,p_images jsonb,p_attachments jsonb,
 p_instrument_classification text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb;resource public.portal_booking_resources;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'BOOKING_ADMIN_REQUIRED';end if;
 if p_category='Instrument' then
  if p_instrument_classification is null or p_instrument_classification not in ('strings','woodwind','brasswind','keyboard','percussion','others') then raise exception 'BOOKING_BAD_INSTRUMENT_CLASS';end if;
 elsif p_instrument_classification is not null then raise exception 'BOOKING_BAD_INSTRUMENT_CLASS';
 end if;
 saved:=public.portal_booking_save_resource_v135(p_actor,p_id,p_name,p_category,p_description,p_clearance,p_expected_updated_at,p_resource_code,p_images,p_attachments);
 update public.portal_booking_resources set instrument_classification=p_instrument_classification,updated_at=clock_timestamp()
  where id=(saved->>'id')::uuid returning * into resource;
 return to_jsonb(resource);
end $$;
revoke all on function public.portal_booking_save_resource_v140(uuid,uuid,text,text,text,jsonb,timestamptz,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.portal_booking_save_resource_v140(uuid,uuid,text,text,text,jsonb,timestamptz,text,jsonb,jsonb,text) to service_role;
notify pgrst,'reload schema';
