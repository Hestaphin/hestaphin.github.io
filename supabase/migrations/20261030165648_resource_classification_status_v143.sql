-- Orchestra project only. One booking status and schedule workflow for all resources.
-- Keep legacy field / RPC names available while older deployed clients update.
alter table public.portal_booking_resources add column if not exists classification text;
update public.portal_booking_resources set classification=instrument_classification
 where category='Instrument' and classification is null and instrument_classification is not null;
alter table public.portal_booking_resources drop constraint if exists portal_booking_instrument_class_check;
alter table public.portal_booking_resources add constraint portal_booking_instrument_class_check check (
 instrument_classification is null or (category='Instrument' and instrument_classification in ('strings','plucked_string','woodwind','brasswind','keyboard','percussion','others'))
);
alter table public.portal_booking_resources add constraint portal_booking_resource_classification_check check (
 classification is null or
 (category='Instrument' and classification in ('strings','plucked_string','woodwind','brasswind','keyboard','percussion','others')) or
 (category='Room' and classification in ('storage','practice','other')) or
 (category='Equipment' and classification in ('trolley','manual_tools','electrical_tools','environment_control','other')) or
 (category='Transportation' and classification in ('vehicle','electric_assist','other'))
);

create or replace function public.portal_booking_save_resource_v143(
 p_actor uuid,p_id uuid,p_name text,p_category text,p_description text,p_clearance jsonb,
 p_expected_updated_at timestamptz,p_resource_code text,p_images jsonb,p_attachments jsonb,p_classification text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb;resource public.portal_booking_resources;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'BOOKING_ADMIN_REQUIRED';end if;
 if p_classification is null or not (
  (p_category='Instrument' and p_classification in ('strings','plucked_string','woodwind','brasswind','keyboard','percussion','others')) or
  (p_category='Room' and p_classification in ('storage','practice','other')) or
  (p_category='Equipment' and p_classification in ('trolley','manual_tools','electrical_tools','environment_control','other')) or
  (p_category='Transportation' and p_classification in ('vehicle','electric_assist','other'))
 ) then raise exception 'BOOKING_BAD_CLASSIFICATION';end if;
 saved:=public.portal_booking_save_resource_v135(p_actor,p_id,p_name,p_category,p_description,p_clearance,p_expected_updated_at,p_resource_code,p_images,p_attachments);
 update public.portal_booking_resources set classification=p_classification,
  instrument_classification=case when p_category='Instrument' then p_classification else null end,updated_at=clock_timestamp()
  where id=(saved->>'id')::uuid returning * into resource;
 return to_jsonb(resource);
end $$;

-- Old instrument-only clients synchronize the new general field as well.
create or replace function public.portal_booking_save_resource_v140(
 p_actor uuid,p_id uuid,p_name text,p_category text,p_description text,p_clearance jsonb,
 p_expected_updated_at timestamptz,p_resource_code text,p_images jsonb,p_attachments jsonb,p_instrument_classification text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb;
begin
 if p_category='Instrument' then
  return public.portal_booking_save_resource_v143(p_actor,p_id,p_name,p_category,p_description,p_clearance,p_expected_updated_at,p_resource_code,p_images,p_attachments,p_instrument_classification);
 end if;
 if p_instrument_classification is not null then raise exception 'BOOKING_BAD_CLASSIFICATION';end if;
 return public.portal_booking_save_resource_v135(p_actor,p_id,p_name,p_category,p_description,p_clearance,p_expected_updated_at,p_resource_code,p_images,p_attachments);
end $$;

-- One entrypoint, table, materializer and existing rolling scheduler for either status.
-- The internal `kind` field is retained for compatibility with older clients.
create or replace function public.portal_booking_create_schedule_v143(
 p_actor uuid,p_resource uuid,p_day date,p_slots integer[],p_repeat_days integer,p_request_id uuid,p_status text
) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 return copku_private.booking_create_series_v142(p_actor,p_resource,p_day,p_slots,p_repeat_days,p_request_id,p_status)||jsonb_build_object('status',p_status);
end $$;

create or replace function public.portal_booking_snapshot_v137(p_actor uuid,p_category text,p_day date default null)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare today date:=(clock_timestamp() at time zone 'Asia/Shanghai')::date;actor_role text;chosen date:=coalesce(p_day,today);
begin
 select role into actor_role from public.profiles where user_id=p_actor and role in('admin','internal');
 if not found then raise exception 'BOOKING_MEMBER_REQUIRED';end if;
 if p_category is null or p_category not in('Room','Instrument','Equipment','Transportation') then raise exception 'Invalid booking category';end if;
 if actor_role<>'admin' and chosen<>today then raise exception 'BOOKING_TODAY_ONLY';end if;
 if chosen<today or chosen>today+6 then raise exception 'BOOKING_DATE_RANGE';end if;
 return jsonb_build_object('recurring_warning_supported',true,'day',chosen,'server_today',today,'min_day',today,'max_day',case when actor_role='admin' then today+6 else today end,'timezone','Asia/Shanghai','server_now',clock_timestamp(),
  'resources',coalesce((select jsonb_agg(to_jsonb(r) order by lower(r.resource_code),r.id) from public.portal_booking_resources r where r.category=p_category),'[]'::jsonb),
  'slots',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('status',s.kind) order by s.resource_id,s.slot_index) from public.portal_booking_slots s join public.portal_booking_resources r on r.id=s.resource_id where r.category=p_category and s.booking_day=chosen and s.released_at is null),'[]'::jsonb),
  'series',case when actor_role='admin' then coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('status',s.kind,'occurrences',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('remaining_slots',(select count(*) from public.portal_booking_slots b where b.recurrence_id=s.id and b.booking_day=o.booking_day and b.released_at is null and b.kind=s.kind)) order by o.booking_day) from public.portal_booking_occurrences o where o.series_id=s.id and o.booking_day between today and today+6),'[]'::jsonb)) order by s.created_at desc) from public.portal_booking_series s join public.portal_booking_resources r on r.id=s.resource_id where s.creator=p_actor and r.category=p_category and (s.active or s.stopped_at>clock_timestamp()-interval '7 days')),'[]'::jsonb) else '[]'::jsonb end);
end $$;

revoke all on function public.portal_booking_save_resource_v143(uuid,uuid,text,text,text,jsonb,timestamptz,text,jsonb,jsonb,text),public.portal_booking_save_resource_v140(uuid,uuid,text,text,text,jsonb,timestamptz,text,jsonb,jsonb,text),public.portal_booking_create_schedule_v143(uuid,uuid,date,integer[],integer,uuid,text),public.portal_booking_snapshot_v137(uuid,text,date) from public,anon,authenticated;
grant execute on function public.portal_booking_save_resource_v143(uuid,uuid,text,text,text,jsonb,timestamptz,text,jsonb,jsonb,text),public.portal_booking_save_resource_v140(uuid,uuid,text,text,text,jsonb,timestamptz,text,jsonb,jsonb,text),public.portal_booking_create_schedule_v143(uuid,uuid,date,integer[],integer,uuid,text),public.portal_booking_snapshot_v137(uuid,text,date) to service_role;
notify pgrst,'reload schema';
