-- Orchestra project: daily 10-minute reservations. All mutations are atomic and
-- callable only by the authenticated portal-booking server handler.
begin;
create table if not exists public.portal_booking_resources (
 id uuid primary key default gen_random_uuid(),
 category text not null check(category in ('Room','Instrument','Equipment','Transportation')),
 name text not null check(length(name) between 1 and 120),
 description text not null default '' check(length(description)<=2000),
 clearance jsonb not null default '{"mode":"all","filters":{},"member_ids":[]}' check(jsonb_typeof(clearance)='object'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default clock_timestamp()
);
-- Resource names are display labels and may repeat; identity is the UUID/ID.
create table if not exists public.portal_booking_slots (
 resource_id uuid not null references public.portal_booking_resources(id) on delete cascade,
 booking_day date not null,
 slot_index integer not null check(slot_index between 0 and 143),
 kind text not null check(kind in ('booked','warning')),
 user_id uuid references public.profiles(user_id) on delete cascade,
 changed_by uuid references public.profiles(user_id) on delete set null,
 changed_at timestamptz not null default clock_timestamp(),
 released_at timestamptz,
 primary key(resource_id,booking_day,slot_index),
 check((kind='booked' and user_id is not null) or (kind='warning' and user_id is null))
);
alter table public.portal_booking_slots add column if not exists released_at timestamptz;
create index if not exists portal_booking_slots_day on public.portal_booking_slots(booking_day,resource_id);
create index if not exists portal_booking_slots_user on public.portal_booking_slots(user_id) where user_id is not null;
create index if not exists portal_booking_slots_changed_by on public.portal_booking_slots(changed_by) where changed_by is not null;
create table if not exists public.portal_booking_audit (
 id uuid primary key default gen_random_uuid(),
 resource_id uuid not null references public.portal_booking_resources(id) on delete cascade,
 actor_id uuid references public.profiles(user_id) on delete set null,
 booking_day date,
 action text not null check(action in ('book','cancel','warning','clear_warning','create_resource','update_resource')),
 slots integer[],
 previous_data jsonb,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists portal_booking_audit_resource on public.portal_booking_audit(resource_id,created_at desc);
create index if not exists portal_booking_audit_actor on public.portal_booking_audit(actor_id) where actor_id is not null;
alter table public.portal_booking_resources enable row level security;
alter table public.portal_booking_slots enable row level security;
alter table public.portal_booking_audit enable row level security;
revoke all on public.portal_booking_resources,public.portal_booking_slots,public.portal_booking_audit from public,anon,authenticated;
grant select,insert,update on public.portal_booking_resources to service_role;
grant select,insert,update on public.portal_booking_slots to service_role;
revoke delete on public.portal_booking_slots from service_role;
grant select,insert on public.portal_booking_audit to service_role;
drop policy if exists booking_resources_server on public.portal_booking_resources;
create policy booking_resources_server on public.portal_booking_resources for all to service_role using(true) with check(true);
drop policy if exists booking_slots_server on public.portal_booking_slots;
create policy booking_slots_server on public.portal_booking_slots for all to service_role using(true) with check(true);
drop policy if exists booking_audit_server on public.portal_booking_audit;
create policy booking_audit_server on public.portal_booking_audit for all to service_role using(true) with check(true);

create schema if not exists copku_private;
revoke all on schema copku_private from public,anon,authenticated;
grant usage on schema copku_private to service_role;

create or replace function public.portal_booking_snapshot(p_actor uuid,p_category text)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare today date:=(clock_timestamp() at time zone 'Asia/Shanghai')::date;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role in('admin','internal')) then raise exception 'BOOKING_MEMBER_REQUIRED';end if;
 if p_category not in('Room','Instrument','Equipment','Transportation') then raise exception 'Invalid booking category';end if;
 return jsonb_build_object('day',today,'timezone','Asia/Shanghai','server_now',clock_timestamp(),
  'resources',coalesce((select jsonb_agg(to_jsonb(r) order by r.name) from public.portal_booking_resources r where r.category=p_category),'[]'::jsonb),
  'slots',coalesce((select jsonb_agg(to_jsonb(s) order by s.resource_id,s.slot_index) from public.portal_booking_slots s join public.portal_booking_resources r on r.id=s.resource_id where r.category=p_category and s.booking_day=today and s.released_at is null),'[]'::jsonb));
end $$;

create or replace function copku_private.validate_booking_clearance(p_clearance jsonb)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare field record;allowed text[]:=array['department','occupation_type','instrument','classification','rank','member_status'];selected_count integer:=0;entry jsonb;member_id text;
begin
 if jsonb_typeof(p_clearance) is distinct from 'object' or coalesce(p_clearance->>'mode','') not in('all','restricted','admin') then raise exception 'BOOKING_BAD_CLEARANCE';end if;
 if p_clearance->>'mode'='restricted' then
  if jsonb_typeof(p_clearance->'filters') is distinct from 'object' or jsonb_typeof(p_clearance->'member_ids') is distinct from 'array' or jsonb_array_length(p_clearance->'member_ids')>500 then raise exception 'BOOKING_BAD_CLEARANCE';end if;
  for field in select key,value from jsonb_each(p_clearance->'filters') loop
   if not(field.key=any(allowed)) or jsonb_typeof(field.value) is distinct from 'array' or jsonb_array_length(field.value)>100 then raise exception 'BOOKING_BAD_CLEARANCE';end if;
   for entry in select value from jsonb_array_elements(field.value) loop
    if jsonb_typeof(entry) is distinct from 'string' or length(entry#>>'{}')>120 then raise exception 'BOOKING_BAD_CLEARANCE';end if;
    selected_count:=selected_count+1;
   end loop;
  end loop;
  for member_id in select jsonb_array_elements_text(p_clearance->'member_ids') loop
   if not exists(select 1 from public.profiles where user_id::text=member_id and role in('admin','internal')) then raise exception 'BOOKING_BAD_CLEARANCE';end if;
   selected_count:=selected_count+1;
  end loop;
  if selected_count=0 then raise exception 'BOOKING_BAD_CLEARANCE';end if;
 else p_clearance:=jsonb_build_object('mode',p_clearance->>'mode','filters','{}'::jsonb,'member_ids','[]'::jsonb);
 end if;
 return p_clearance;
end $$;

create or replace function copku_private.booking_can_book(p_clearance jsonb,p_member jsonb)
 returns boolean language plpgsql security invoker set search_path='' as $$
declare field text;
begin
 if p_member->>'role'='admin' then return true;end if;
 if p_member->>'role' is distinct from 'internal' then return false;end if;
 if p_clearance->>'mode'='all' then return true;end if;
 if p_clearance->>'mode' is distinct from 'restricted' then return false;end if;
 if jsonb_array_length(coalesce(p_clearance->'member_ids','[]'::jsonb))>0 and not(p_clearance->'member_ids' ? (p_member->>'user_id')) then return false;end if;
 foreach field in array array['department','occupation_type','instrument','classification','rank','member_status'] loop
  if jsonb_array_length(coalesce(p_clearance->'filters'->field,'[]'::jsonb))>0 and not(p_clearance->'filters'->field ? coalesce(p_member->>field,'')) then return false;end if;
 end loop;
 return true;
end $$;

create or replace function copku_private.booking_write_booked(p_actor uuid,p_resource uuid,p_day date,p_slots integer[])
 returns integer language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 if exists(select 1 from public.portal_booking_slots where resource_id=p_resource and booking_day=p_day and slot_index=any(p_slots) and released_at is null and kind='warning') then raise exception 'BOOKING_WARNING';end if;
 if exists(select 1 from public.portal_booking_slots where resource_id=p_resource and booking_day=p_day and slot_index=any(p_slots) and released_at is null and kind='booked' and user_id<>p_actor) then raise exception 'BOOKING_CONFLICT';end if;
 insert into public.portal_booking_slots(resource_id,booking_day,slot_index,kind,user_id,changed_by)
  select p_resource,p_day,s,'booked',p_actor,p_actor from unnest(p_slots) s
  on conflict(resource_id,booking_day,slot_index) do update set kind='booked',user_id=p_actor,changed_by=p_actor,changed_at=clock_timestamp(),released_at=null where portal_booking_slots.released_at is not null;
 get diagnostics changed=row_count;
 return changed;
end $$;

create or replace function copku_private.booking_cancel_owned(p_actor uuid,p_resource uuid,p_day date,p_slots integer[])
 returns integer language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
  if cardinality(p_slots)<>(select count(*) from public.portal_booking_slots where resource_id=p_resource and booking_day=p_day and slot_index=any(p_slots) and released_at is null and kind='booked' and user_id=p_actor) then raise exception 'BOOKING_OWN_ONLY';end if;
  update public.portal_booking_slots set released_at=clock_timestamp(),changed_by=p_actor,changed_at=clock_timestamp() where resource_id=p_resource and booking_day=p_day and slot_index=any(p_slots) and released_at is null and kind='booked' and user_id=p_actor;
 get diagnostics changed=row_count;
 return changed;
end $$;

create or replace function copku_private.booking_set_warning(p_actor uuid,p_resource uuid,p_day date,p_slots integer[])
 returns integer language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'BOOKING_ADMIN_REQUIRED';end if;
  insert into public.portal_booking_slots(resource_id,booking_day,slot_index,kind,user_id,changed_by)
   select p_resource,p_day,s,'warning',null,p_actor from unnest(p_slots) s
   on conflict(resource_id,booking_day,slot_index) do update set kind='warning',user_id=null,changed_by=p_actor,changed_at=clock_timestamp(),released_at=null;
 get diagnostics changed=row_count;
 return changed;
end $$;

create or replace function copku_private.booking_clear_warning(p_actor uuid,p_resource uuid,p_day date,p_slots integer[])
 returns integer language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'BOOKING_ADMIN_REQUIRED';end if;
  if cardinality(p_slots)<>(select count(*) from public.portal_booking_slots where resource_id=p_resource and booking_day=p_day and slot_index=any(p_slots) and released_at is null and kind='warning') then raise exception 'BOOKING_WARNING_ONLY';end if;
  update public.portal_booking_slots set released_at=clock_timestamp(),changed_by=p_actor,changed_at=clock_timestamp() where resource_id=p_resource and booking_day=p_day and slot_index=any(p_slots) and released_at is null and kind='warning';
 get diagnostics changed=row_count;
 return changed;
end $$;

create or replace function public.portal_booking_save_resource(p_actor uuid,p_id uuid,p_name text,p_category text,p_description text,p_clearance jsonb,p_expected_updated_at timestamptz)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare resource public.portal_booking_resources;previous jsonb;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'BOOKING_ADMIN_REQUIRED';end if;
 if p_category is null or p_category not in('Room','Instrument','Equipment','Transportation') or p_name is null or length(trim(p_name)) not between 1 and 120 or p_description is null or length(p_description)>2000 then raise exception 'Invalid resource';end if;
 p_clearance:=copku_private.validate_booking_clearance(p_clearance);
 if p_id is null then
  insert into public.portal_booking_resources(category,name,description,clearance) values(p_category,trim(p_name),trim(p_description),p_clearance) returning * into resource;
 else
  select * into resource from public.portal_booking_resources where id=p_id for update;
  if not found then raise exception 'BOOKING_RESOURCE_MISSING';end if;
  if resource.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_RESOURCE_CHANGED';end if;
  if resource.category<>p_category then raise exception 'Resource category cannot change';end if;
  previous:=to_jsonb(resource);
  update public.portal_booking_resources set name=trim(p_name),description=trim(p_description),clearance=p_clearance,updated_at=clock_timestamp() where id=p_id returning * into resource;
 end if;
 insert into public.portal_booking_audit(resource_id,actor_id,action,previous_data) values(resource.id,p_actor,case when p_id is null then 'create_resource' else 'update_resource' end,previous);
 return to_jsonb(resource);
end $$;

create or replace function public.portal_booking_change_slots(p_actor uuid,p_resource uuid,p_day date,p_slots integer[],p_action text)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare resource public.portal_booking_resources;member public.profiles;slots integer[];previous jsonb;changed integer;clock_minute integer;today date;
begin
 if p_slots is null or cardinality(p_slots) not between 1 and 144 or exists(select 1 from unnest(p_slots) s where s is null or s<0 or s>143) or p_action is null or p_action not in('book','cancel','warning','clear_warning') then raise exception 'Invalid booking selection';end if;
 select array_agg(distinct s order by s) into slots from unnest(p_slots) s;
 select * into resource from public.portal_booking_resources where id=p_resource for update;
 if not found then raise exception 'BOOKING_RESOURCE_MISSING';end if;
 select * into member from public.profiles where user_id=p_actor and role in('admin','internal') for share;
 if not found then raise exception 'BOOKING_MEMBER_REQUIRED';end if;
 today:=(clock_timestamp() at time zone 'Asia/Shanghai')::date;
 clock_minute:=extract(hour from clock_timestamp() at time zone 'Asia/Shanghai')::integer*60+extract(minute from clock_timestamp() at time zone 'Asia/Shanghai')::integer;
 if p_day is distinct from today then raise exception 'BOOKING_TODAY_ONLY';end if;
 if p_action in('warning','clear_warning') and member.role<>'admin' then raise exception 'BOOKING_ADMIN_REQUIRED';end if;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into previous from public.portal_booking_slots s where resource_id=p_resource and booking_day=today and slot_index=any(slots);
 if p_action='book' then
  if not copku_private.booking_can_book(resource.clearance,to_jsonb(member)) then raise exception 'BOOKING_CLEARANCE';end if;
  if exists(select 1 from unnest(slots) s where s<clock_minute/10) then raise exception 'BOOKING_ELAPSED';end if;
  changed:=copku_private.booking_write_booked(p_actor,p_resource,today,slots);
 elsif p_action='cancel' then changed:=copku_private.booking_cancel_owned(p_actor,p_resource,today,slots);
 elsif p_action='warning' then changed:=copku_private.booking_set_warning(p_actor,p_resource,today,slots);
 else changed:=copku_private.booking_clear_warning(p_actor,p_resource,today,slots);
 end if;
 insert into public.portal_booking_audit(resource_id,actor_id,booking_day,action,slots,previous_data) values(p_resource,p_actor,today,p_action,slots,previous);
 return jsonb_build_object('ok',true,'changed_slots',changed,'day',today);
end $$;

revoke all on function public.portal_booking_snapshot(uuid,text),copku_private.validate_booking_clearance(jsonb),copku_private.booking_can_book(jsonb,jsonb),copku_private.booking_write_booked(uuid,uuid,date,integer[]),copku_private.booking_cancel_owned(uuid,uuid,date,integer[]),copku_private.booking_set_warning(uuid,uuid,date,integer[]),copku_private.booking_clear_warning(uuid,uuid,date,integer[]),public.portal_booking_save_resource(uuid,uuid,text,text,text,jsonb,timestamptz),public.portal_booking_change_slots(uuid,uuid,date,integer[],text) from public,anon,authenticated;
grant execute on function public.portal_booking_snapshot(uuid,text),copku_private.validate_booking_clearance(jsonb),copku_private.booking_can_book(jsonb,jsonb),copku_private.booking_write_booked(uuid,uuid,date,integer[]),copku_private.booking_cancel_owned(uuid,uuid,date,integer[]),copku_private.booking_set_warning(uuid,uuid,date,integer[]),copku_private.booking_clear_warning(uuid,uuid,date,integer[]),public.portal_booking_save_resource(uuid,uuid,text,text,text,jsonb,timestamptz),public.portal_booking_change_slots(uuid,uuid,date,integer[],text) to service_role;
commit;
