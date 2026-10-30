-- Orchestra v1.42: repeat administrator warnings using the existing rolling
-- seven-day worker. Existing series retain their booking kind and behavior.
alter table public.portal_booking_series add column if not exists kind text not null default 'booked' check(kind in('booked','warning'));

create or replace function copku_private.booking_materialize(p_series uuid,p_day date)
 returns text language plpgsql security invoker set search_path='' as $$
declare series public.portal_booking_series;reason text;previous jsonb;current_slot integer;
begin
 select * into series from public.portal_booking_series where id=p_series;
 if not found or not series.active then return 'inactive';end if;
 if exists(select 1 from public.portal_booking_occurrences where series_id=p_series and booking_day=p_day) then return 'existing';end if;
 -- Historical status 'booked' means a date was materialized. The series
 -- kind distinguishes an occupied booking from an administrator warning.
 if series.kind='warning' then
  select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into previous from public.portal_booking_slots s where resource_id=series.resource_id and booking_day=p_day and slot_index=any(series.slots);
  perform copku_private.booking_set_warning(series.creator,series.resource_id,p_day,series.slots);
  update public.portal_booking_slots set recurrence_id=series.id where resource_id=series.resource_id and booking_day=p_day and slot_index=any(series.slots) and kind='warning' and released_at is null;
  insert into public.portal_booking_occurrences(series_id,booking_day,status) values(p_series,p_day,'booked');
  insert into public.portal_booking_audit(resource_id,actor_id,booking_day,action,slots,previous_data) values(series.resource_id,series.creator,p_day,'warning',series.slots,previous);
  return 'booked';
 end if;
 current_slot:=extract(hour from clock_timestamp() at time zone 'Asia/Shanghai')::integer*6+extract(minute from clock_timestamp() at time zone 'Asia/Shanghai')::integer/10;
 if p_day=(clock_timestamp() at time zone 'Asia/Shanghai')::date and exists(select 1 from unnest(series.slots) s where s<current_slot) then reason:='elapsed';
 elsif exists(select 1 from public.portal_booking_slots where resource_id=series.resource_id and booking_day=p_day and slot_index=any(series.slots) and released_at is null and kind='warning') then reason:='warning';
 elsif exists(select 1 from public.portal_booking_slots where resource_id=series.resource_id and booking_day=p_day and slot_index=any(series.slots) and released_at is null and (user_id is distinct from series.creator or recurrence_id is not null and recurrence_id<>series.id)) then reason:='booked';end if;
 if reason is not null then
  insert into public.portal_booking_occurrences(series_id,booking_day,status,reason) values(p_series,p_day,'conflict',reason);return reason;
 end if;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into previous from public.portal_booking_slots s where resource_id=series.resource_id and booking_day=p_day and slot_index=any(series.slots);
 insert into public.portal_booking_slots(resource_id,booking_day,slot_index,kind,user_id,changed_by,recurrence_id)
  select series.resource_id,p_day,s,'booked',series.creator,series.creator,series.id from unnest(series.slots) s
  on conflict(resource_id,booking_day,slot_index) do update set kind='booked',user_id=series.creator,changed_by=series.creator,changed_at=clock_timestamp(),released_at=null,recurrence_id=series.id;
 insert into public.portal_booking_occurrences(series_id,booking_day,status) values(p_series,p_day,'booked');
 insert into public.portal_booking_audit(resource_id,actor_id,booking_day,action,slots,previous_data) values(series.resource_id,series.creator,p_day,'book',series.slots,previous);
 return 'booked';
end $$;

create or replace function copku_private.booking_create_series_v142(p_actor uuid,p_resource uuid,p_day date,p_slots integer[],p_repeat_days integer,p_request_id uuid,p_kind text)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare series public.portal_booking_series;today date:=(clock_timestamp() at time zone 'Asia/Shanghai')::date;slots integer[];outcome text;first_id uuid;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'BOOKING_ADMIN_REQUIRED';end if;
 if p_kind is null or p_kind not in('booked','warning') then raise exception 'BOOKING_BAD_REPEAT';end if;
 if p_request_id is null or p_repeat_days is null or p_repeat_days not between 1 and 3650 or p_slots is null or cardinality(p_slots) not between 1 and 144 or exists(select 1 from unnest(p_slots) s where s is null or s<0 or s>143) then raise exception 'BOOKING_BAD_REPEAT';end if;
 perform pg_advisory_xact_lock(hashtextextended('booking:'||p_actor::text||':'||p_request_id::text,0));
 select * into series from public.portal_booking_series where creator=p_actor and request_id=p_request_id;
 if found then
  if series.kind<>p_kind then raise exception 'BOOKING_REQUEST_CHANGED';end if;
  return jsonb_build_object('ok',true,'series_id',series.id,'duplicate',true);
 end if;
 if p_day is null or p_day<today or p_day>today+6 then raise exception 'BOOKING_DATE_RANGE';end if;
 perform 1 from public.portal_booking_resources where id=p_resource for update;
 if not found then raise exception 'BOOKING_RESOURCE_MISSING';end if;
 select array_agg(distinct s order by s) into slots from unnest(p_slots) s;
 insert into public.portal_booking_series(resource_id,creator,request_id,anchor_day,repeat_days,slots,next_day,kind)
  values(p_resource,p_actor,p_request_id,p_day,p_repeat_days,slots,p_day,p_kind) returning * into series;
 while series.next_day<=today+6 loop
  outcome:=copku_private.booking_materialize(series.id,series.next_day);
  if series.next_day=p_day and outcome<>'booked' then
   if outcome='elapsed' then raise exception 'BOOKING_ELAPSED';elsif outcome='warning' then raise exception 'BOOKING_WARNING';else raise exception 'BOOKING_CONFLICT';end if;
  end if;
  series.next_day:=series.next_day+series.repeat_days;
 end loop;
 update public.portal_booking_series set next_day=series.next_day where id=series.id;
 return jsonb_build_object('ok',true,'series_id',series.id,'kind',series.kind,case when series.kind='warning' then 'warning_dates' else 'booked_dates' end,(select count(*) from public.portal_booking_occurrences where series_id=series.id and status='booked'),'conflicts',coalesce((select jsonb_agg(jsonb_build_object('day',booking_day,'reason',reason) order by booking_day) from public.portal_booking_occurrences where series_id=series.id and status='conflict'),'[]'::jsonb));
end $$;

create or replace function public.portal_booking_create_series(p_actor uuid,p_resource uuid,p_day date,p_slots integer[],p_repeat_days integer,p_request_id uuid)
 returns jsonb language sql security invoker set search_path='' as $$ select copku_private.booking_create_series_v142(p_actor,p_resource,p_day,p_slots,p_repeat_days,p_request_id,'booked') $$;
create or replace function public.portal_booking_create_warning_series(p_actor uuid,p_resource uuid,p_day date,p_slots integer[],p_repeat_days integer,p_request_id uuid)
 returns jsonb language sql security invoker set search_path='' as $$ select copku_private.booking_create_series_v142(p_actor,p_resource,p_day,p_slots,p_repeat_days,p_request_id,'warning') $$;


create or replace function public.portal_booking_stop_series(p_actor uuid,p_series uuid)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare series public.portal_booking_series;target uuid;record record;today date:=(clock_timestamp() at time zone 'Asia/Shanghai')::date;released integer:=0;changed integer;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'BOOKING_ADMIN_REQUIRED';end if;
 select resource_id into target from public.portal_booking_series where id=p_series and creator=p_actor;
 if not found then raise exception 'BOOKING_SERIES_OWNER';end if;
 perform 1 from public.portal_booking_resources where id=target for update;
 select * into series from public.portal_booking_series where id=p_series for update;
 update public.portal_booking_series set active=false,stopped_at=coalesce(stopped_at,clock_timestamp()) where id=p_series;
 for record in select booking_day,array_agg(slot_index order by slot_index) slots,jsonb_agg(to_jsonb(s)) previous from public.portal_booking_slots s
  where recurrence_id=p_series and kind=series.kind and (series.kind='warning' or user_id=p_actor) and released_at is null and booking_day>today group by booking_day loop
  update public.portal_booking_slots set released_at=clock_timestamp(),changed_by=p_actor,changed_at=clock_timestamp() where recurrence_id=p_series and booking_day=record.booking_day and kind=series.kind and (series.kind='warning' or user_id=p_actor) and released_at is null;
  get diagnostics changed=row_count;released:=released+changed;
  insert into public.portal_booking_audit(resource_id,actor_id,booking_day,action,slots,previous_data) values(target,p_actor,record.booking_day,case when series.kind='warning' then 'clear_warning' else 'cancel' end,record.slots,record.previous);
 end loop;
 update public.portal_booking_occurrences set status='cancelled',reason='series_stopped' where series_id=p_series and booking_day>today and status='booked';
 return jsonb_build_object('ok',true,'released_slots',released);
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
  'resources',coalesce((select jsonb_agg(to_jsonb(r) order by r.name,r.id) from public.portal_booking_resources r where r.category=p_category),'[]'::jsonb),
  'slots',coalesce((select jsonb_agg(to_jsonb(s) order by s.resource_id,s.slot_index) from public.portal_booking_slots s join public.portal_booking_resources r on r.id=s.resource_id where r.category=p_category and s.booking_day=chosen and s.released_at is null),'[]'::jsonb),
  'series',case when actor_role='admin' then coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('occurrences',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('remaining_slots',(select count(*) from public.portal_booking_slots b where b.recurrence_id=s.id and b.booking_day=o.booking_day and b.released_at is null and b.kind=s.kind)) order by o.booking_day) from public.portal_booking_occurrences o where o.series_id=s.id and o.booking_day between today and today+6),'[]'::jsonb)) order by s.created_at desc) from public.portal_booking_series s join public.portal_booking_resources r on r.id=s.resource_id where s.creator=p_actor and r.category=p_category and (s.active or s.stopped_at>clock_timestamp()-interval '7 days')),'[]'::jsonb) else '[]'::jsonb end);
end $$;

revoke all on function copku_private.booking_materialize(uuid,date),copku_private.booking_create_series_v142(uuid,uuid,date,integer[],integer,uuid,text),public.portal_booking_create_series(uuid,uuid,date,integer[],integer,uuid),public.portal_booking_create_warning_series(uuid,uuid,date,integer[],integer,uuid),public.portal_booking_stop_series(uuid,uuid),public.portal_booking_snapshot_v137(uuid,text,date) from public,anon,authenticated;
grant execute on function copku_private.booking_materialize(uuid,date),copku_private.booking_create_series_v142(uuid,uuid,date,integer[],integer,uuid,text),public.portal_booking_create_series(uuid,uuid,date,integer[],integer,uuid),public.portal_booking_create_warning_series(uuid,uuid,date,integer[],integer,uuid),public.portal_booking_stop_series(uuid,uuid),public.portal_booking_snapshot_v137(uuid,text,date) to service_role;
notify pgrst,'reload schema';
