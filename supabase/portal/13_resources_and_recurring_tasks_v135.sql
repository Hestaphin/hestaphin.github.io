-- Orchestra project only. Additive v1.35 upgrade; existing tasks and booking rules stay intact.
begin;
alter table public.portal_booking_resources
 add column if not exists resource_code text not null default '' check(length(resource_code)<=64),
 add column if not exists images jsonb not null default '[]' check(jsonb_typeof(images)='array' and jsonb_array_length(images)<=8),
 add column if not exists attachments jsonb not null default '[]' check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=8);
create unique index if not exists portal_booking_resource_code on public.portal_booking_resources(lower(resource_code)) where resource_code<>'';

insert into storage.buckets(id,name,public,file_size_limit) values('portal-resource-files','portal-resource-files',false,10485760)
 on conflict(id) do update set public=false,file_size_limit=10485760;
-- Restrictive guard also covers older broad owner-based Storage policies.
create policy resource_files_guard on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'portal-resource-files' or (public.is_admin((select auth.uid())) and (storage.foldername(name))[1]=(select auth.uid())::text))
 with check(bucket_id<>'portal-resource-files' or (public.is_admin((select auth.uid())) and (storage.foldername(name))[1]=(select auth.uid())::text));
create policy resource_files_upload on storage.objects for insert to authenticated
 with check(bucket_id='portal-resource-files' and public.is_admin((select auth.uid())) and (storage.foldername(name))[1]=(select auth.uid())::text);

create or replace function copku_private.validate_resource_media(p_actor uuid,p_files jsonb,p_previous jsonb,p_images boolean)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare file jsonb;item_size bigint;path text;seen text[]:=array[]::text[];
begin
 if jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files)>8 then raise exception 'BOOKING_BAD_MEDIA';end if;
 for file in select value from jsonb_array_elements(p_files) loop
  if jsonb_typeof(file) is distinct from 'object' or jsonb_typeof(file->'size') is distinct from 'number' or (file->>'size')!~'^[0-9]+$' then raise exception 'BOOKING_BAD_MEDIA';end if;
  item_size:=(file->>'size')::bigint;path:=file->>'path';
  if item_size not between 1 and 10485760 or length(coalesce(file->>'name','')) not between 1 and 255 or path is null or length(path)>600
   or path!~'^[a-fA-F0-9-]{36}/[a-fA-F0-9-]{36}/[a-zA-Z0-9_.-]+$' or split_part(path,'/',3)='..' or path=any(seen) then raise exception 'BOOKING_BAD_MEDIA';end if;
  seen:=array_append(seen,path);
  if split_part(path,'/',1)<>p_actor::text and not coalesce(p_previous,'[]'::jsonb) @> jsonb_build_array(file) then raise exception 'BOOKING_BAD_MEDIA';end if;
  if p_images and coalesce(file->>'type','') not in('image/png','image/jpeg','image/webp','image/gif') then raise exception 'BOOKING_BAD_MEDIA';end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='portal-resource-files' and o.name=path
    and (o.metadata->>'size')::bigint=item_size and (not p_images or o.metadata->>'mimetype'=file->>'type')) then raise exception 'BOOKING_BAD_MEDIA';end if;
 end loop;
 return p_files;
end $$;
revoke all on function copku_private.validate_resource_media(uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function copku_private.validate_resource_media(uuid,jsonb,jsonb,boolean) to service_role;

create or replace function public.portal_booking_save_resource_v135(p_actor uuid,p_id uuid,p_name text,p_category text,p_description text,p_clearance jsonb,p_expected_updated_at timestamptz,p_resource_code text,p_images jsonb,p_attachments jsonb)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare resource public.portal_booking_resources;previous jsonb;saved jsonb;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'BOOKING_ADMIN_REQUIRED';end if;
 if p_resource_code is null or length(trim(p_resource_code)) not between 1 and 64 then raise exception 'Invalid resource ID';end if;
 if p_id is not null then
  select * into resource from public.portal_booking_resources where id=p_id for update;
  if not found then raise exception 'BOOKING_RESOURCE_MISSING';end if;
  if resource.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_RESOURCE_CHANGED';end if;
  previous:=to_jsonb(resource);
 end if;
 p_images:=copku_private.validate_resource_media(p_actor,p_images,resource.images,true);
 p_attachments:=copku_private.validate_resource_media(p_actor,p_attachments,resource.attachments,false);
 -- Reuse the existing checked, audited, category-preserving resource writer.
 saved:=public.portal_booking_save_resource(p_actor,p_id,p_name,p_category,p_description,p_clearance,p_expected_updated_at);
 -- Always use the returned UUID: several resources can have the same name.
 update public.portal_booking_resources set resource_code=trim(p_resource_code),images=p_images,attachments=p_attachments,updated_at=clock_timestamp() where id=(saved->>'id')::uuid returning * into resource;
 return to_jsonb(resource);
end $$;
revoke all on function public.portal_booking_save_resource_v135(uuid,uuid,text,text,text,jsonb,timestamptz,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.portal_booking_save_resource_v135(uuid,uuid,text,text,text,jsonb,timestamptz,text,jsonb,jsonb) to service_role;

create table public.portal_task_series (
 id uuid primary key default gen_random_uuid(),
 sender uuid not null references public.profiles(user_id) on delete cascade,
 request_id uuid not null,
 first_task uuid references public.portal_tasks(id) on delete set null,
 title text not null check(length(title) between 1 and 200),
 body jsonb not null,
 kind text not null check(kind in('rehearsal','workload','information')),
 recipients jsonb not null check(jsonb_typeof(recipients)='array' and jsonb_array_length(recipients)>0),
 anchor_at timestamptz not null,
 duration interval not null check(duration>interval '0 seconds'),
 repeat_unit text not null check(repeat_unit in('hours','days')),
 repeat_every integer not null check(repeat_every>=1 and ((repeat_unit='hours' and repeat_every<=8760) or (repeat_unit='days' and repeat_every<=3650))),
 next_at timestamptz not null,
 active boolean not null default true,
 stopped_at timestamptz,
 created_at timestamptz not null default now(),
 unique(sender,request_id)
);
create index portal_task_series_due on public.portal_task_series(next_at,id) where active;
create index portal_task_series_first on public.portal_task_series(first_task) where first_task is not null;
alter table public.portal_task_series enable row level security;
revoke all on public.portal_task_series from public,anon,authenticated;
grant select(id,sender,repeat_unit,repeat_every,active,next_at) on public.portal_task_series to authenticated;
grant all on public.portal_task_series to service_role;
create policy series_sender_read on public.portal_task_series for select to authenticated using(sender=(select auth.uid()) and public.is_admin((select auth.uid())));
alter table public.portal_tasks add column recurrence_id uuid references public.portal_task_series(id) on delete set null,add column recurrence_at timestamptz;
create unique index portal_task_occurrence_unique on public.portal_tasks(recurrence_id,recurrence_at) where recurrence_id is not null;
create index if not exists portal_task_sort on public.portal_tasks(created_at desc,id);
create index if not exists portal_notification_sort on public.portal_notifications(pinned desc,created_at desc,id);
create index if not exists portal_reply_sort on public.portal_replies(notification_id,created_at,id);

-- The private schema is outside the Data API. Only the two checked entry points
-- below are executable by members; the cron worker has no member execute grant.
create schema copku_tasks;
revoke all on schema copku_tasks from public,anon,authenticated;
grant usage on schema copku_tasks to authenticated,service_role;
alter default privileges in schema copku_tasks revoke execute on functions from public;

create function copku_tasks.send_recurring(p_title text,p_body jsonb,p_kind text,p_start timestamptz,p_end timestamptz,p_recipients jsonb,p_repeat_unit text,p_repeat_every integer,p_request_id uuid)
 returns uuid language plpgsql security definer set search_path='' as $$
declare first_id uuid;series_id uuid;period interval;
begin
 if auth.uid() is null or not public.is_admin(auth.uid()) then raise exception 'Administrator required';end if;
 if p_request_id is null or p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_end<=p_start or p_end-p_start>interval '10 years'
  or p_repeat_unit is null or p_repeat_unit not in('hours','days') or p_repeat_every is null or p_repeat_every<1 or p_repeat_every>(case when p_repeat_unit='hours' then 8760 else 3650 end) then raise exception 'Invalid repeat interval or task duration';end if;
 if p_start<clock_timestamp()-interval '1 day' then raise exception 'The first recurring task must start today or later';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_request_id::text,0));
 select first_task into first_id from public.portal_task_series where sender=auth.uid() and request_id=p_request_id;
 if found then return first_id;end if;
 first_id:=public.portal_send_task(p_title,p_body,p_kind,p_start,p_end,p_recipients);
 period:=case when p_repeat_unit='hours' then make_interval(hours=>p_repeat_every) else make_interval(days=>p_repeat_every) end;
 insert into public.portal_task_series(sender,request_id,first_task,title,body,kind,recipients,anchor_at,duration,repeat_unit,repeat_every,next_at)
  values(auth.uid(),p_request_id,first_id,p_title,p_body,p_kind,p_recipients,p_start,p_end-p_start,p_repeat_unit,p_repeat_every,p_start+period) returning id into series_id;
 update public.portal_tasks set recurrence_id=series_id,recurrence_at=p_start where id=first_id;
 return first_id;
end $$;
create function public.portal_send_recurring_task(p_title text,p_body jsonb,p_kind text,p_start timestamptz,p_end timestamptz,p_recipients jsonb,p_repeat_unit text,p_repeat_every integer,p_request_id uuid)
 returns uuid language sql security invoker set search_path='' as $$ select copku_tasks.send_recurring(p_title,p_body,p_kind,p_start,p_end,p_recipients,p_repeat_unit,p_repeat_every,p_request_id) $$;
revoke all on function copku_tasks.send_recurring(text,jsonb,text,timestamptz,timestamptz,jsonb,text,integer,uuid),public.portal_send_recurring_task(text,jsonb,text,timestamptz,timestamptz,jsonb,text,integer,uuid) from public,anon;
grant execute on function copku_tasks.send_recurring(text,jsonb,text,timestamptz,timestamptz,jsonb,text,integer,uuid),public.portal_send_recurring_task(text,jsonb,text,timestamptz,timestamptz,jsonb,text,integer,uuid) to authenticated;

create function copku_tasks.stop_series(p_series uuid)
 returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin(auth.uid()) then raise exception 'Administrator required';end if;
 perform 1 from public.portal_task_series where id=p_series and sender=auth.uid() for update;
 if not found then raise exception 'Sender required';end if;
 update public.portal_task_series set active=false,stopped_at=coalesce(stopped_at,clock_timestamp()) where id=p_series;
end $$;
create function public.portal_stop_task_series(p_series uuid) returns void language sql security invoker set search_path='' as $$ select copku_tasks.stop_series(p_series) $$;
revoke all on function copku_tasks.stop_series(uuid),public.portal_stop_task_series(uuid) from public,anon;
grant execute on function copku_tasks.stop_series(uuid),public.portal_stop_task_series(uuid) to authenticated;

create function copku_tasks.emit_due_tasks()
 returns integer language plpgsql security invoker set search_path='' set timezone='Asia/Shanghai' as $$
declare series public.portal_task_series;task_id uuid;recipient jsonb;period interval;emitted integer:=0;per_series integer;cutoff timestamptz:=clock_timestamp();
begin
 -- Lock and advance the series atomically. No future occurrence is pre-created.
 for series in select * from public.portal_task_series where active and next_at<=cutoff order by next_at,id limit 100 for update skip locked loop
  if not exists(select 1 from public.profiles where user_id=series.sender and role='admin') then
   update public.portal_task_series set active=false,stopped_at=cutoff where id=series.id;continue;
  end if;
  period:=case when series.repeat_unit='hours' then make_interval(hours=>series.repeat_every) else make_interval(days=>series.repeat_every) end;
  per_series:=0;
  while series.next_at<=cutoff and per_series<100 and emitted<500 loop
   task_id:=null;
   insert into public.portal_tasks(sender,title,body,kind,starts_at,ends_at,recurrence_id,recurrence_at)
    values(series.sender,series.title,series.body,series.kind,series.next_at,series.next_at+series.duration,series.id,series.next_at)
    on conflict(recurrence_id,recurrence_at) where recurrence_id is not null do nothing returning id into task_id;
   if task_id is not null then
    insert into public.portal_task_recipients(task_id,user_id,mandatory,urgent,status)
     select task_id,p.user_id,(r->>'mandatory')::boolean,(r->>'urgent')::boolean,'unseen'
     from jsonb_array_elements(series.recipients) r join public.profiles p on p.user_id=(r->>'user_id')::uuid and p.role in('admin','internal');
    emitted:=emitted+1;
   end if;
   series.next_at:=series.next_at+period;per_series:=per_series+1;
  end loop;
  update public.portal_task_series set next_at=series.next_at where id=series.id;
  exit when emitted>=500;
 end loop;
 return emitted;
end $$;
revoke all on function copku_tasks.emit_due_tasks() from public,anon,authenticated;
grant execute on function copku_tasks.emit_due_tasks() to service_role;
select cron.schedule('copku-recurring-task-reminders','* * * * *','select copku_tasks.emit_due_tasks();');
notify pgrst,'reload schema';
commit;
