-- Uniform catalogue, group assignments and decision-gated applications.
create table public.portal_uniform_categories(id uuid primary key default gen_random_uuid(),name text not null check(length(btrim(name)) between 1 and 80),sort_order integer not null default 0,archived_at timestamptz,updated_at timestamptz not null default clock_timestamp());
create unique index uniform_category_name on public.portal_uniform_categories(lower(name)) where archived_at is null;
insert into public.portal_uniform_categories(name,sort_order) select name,ord from unnest(array['Service uniform','Service trousers','Service shirt','Service shoes','Coat','Socks','Belt','Service cap']) with ordinality as c(name,ord);
create table public.portal_uniform_items(id uuid primary key default gen_random_uuid(),category_id uuid not null references public.portal_uniform_categories(id),name text not null check(length(btrim(name)) between 1 and 80),measurements jsonb not null default '[]',sizes jsonb not null default '[]',image jsonb,archived_at timestamptz,updated_at timestamptz not null default clock_timestamp());
create unique index uniform_item_name on public.portal_uniform_items(category_id,lower(name)) where archived_at is null;
create table public.portal_uniform_templates(id uuid primary key default gen_random_uuid(),name text not null check(length(btrim(name)) between 1 and 100),filters jsonb not null default '{}',priority integer not null default 0 check(priority between -1000 and 1000),item_ids uuid[] not null,archived_at timestamptz,updated_at timestamptz not null default clock_timestamp());
create table public.portal_uniform_holdings(user_id uuid not null references public.profiles(user_id) on delete cascade,category_id uuid not null references public.portal_uniform_categories(id),item_id uuid not null references public.portal_uniform_items(id),size text not null,status text not null check(status in('ready','issued')),item_snapshot jsonb not null,updated_at timestamptz not null default clock_timestamp(),primary key(user_id,category_id));
create table public.portal_uniform_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,request_key uuid not null,submitted_payload jsonb not null,created_at timestamptz not null default clock_timestamp(),unique(user_id,request_key));
create table public.portal_uniform_request_lines(id uuid primary key default gen_random_uuid(),request_id uuid not null references public.portal_uniform_requests(id) on delete cascade,user_id uuid not null references public.profiles(user_id) on delete cascade,category_id uuid not null references public.portal_uniform_categories(id),item_id uuid not null references public.portal_uniform_items(id),size text not null,mode text not null check(mode in('new','exchange')),reason text not null check(length(btrim(reason)) between 1 and 2000),item_snapshot jsonb not null,previous_record jsonb,decision text not null default 'pending' check(decision in('pending','approved','rejected')),decision_note text not null default '',decided_by uuid references public.profiles(user_id) on delete set null,decided_at timestamptz,unique(request_id,category_id));
create unique index uniform_one_pending_category on public.portal_uniform_request_lines(user_id,category_id) where decision='pending';
create index uniform_requests_user_date on public.portal_uniform_requests(user_id,created_at desc);
create index uniform_request_lines_request on public.portal_uniform_request_lines(request_id);
create table public.portal_uniform_events(id bigint generated always as identity primary key,actor uuid references public.profiles(user_id) on delete set null,user_id uuid references public.profiles(user_id) on delete set null,action text not null,entity_id uuid,data jsonb not null default '{}',created_at timestamptz not null default clock_timestamp());
-- Direct browser reads/writes are denied. The checked Edge API uses service_role.
do $$ declare t text;begin foreach t in array array['portal_uniform_categories','portal_uniform_items','portal_uniform_templates','portal_uniform_holdings','portal_uniform_requests','portal_uniform_request_lines','portal_uniform_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy uniform_service_only on public.%I for all to service_role using(true) with check(true)',t);
end loop;end $$;
grant usage,select on sequence public.portal_uniform_events_id_seq to service_role;

create function copku_private.uniform_member(p_actor uuid) returns public.profiles language plpgsql security invoker set search_path='' as $$
declare m public.profiles;begin select * into m from public.profiles where user_id=p_actor and role in('admin','internal');if not found then raise exception 'UNIFORM_MEMBER_REQUIRED';end if;return m;end $$;
create function copku_private.uniform_admin(p_actor uuid) returns void language plpgsql security invoker set search_path='' as $$ begin if not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'UNIFORM_ADMIN_REQUIRED';end if;end $$;
create function copku_private.uniform_eligible(p_user uuid,p_item uuid) returns boolean language sql stable security invoker set search_path='' as $$
 with candidates as (
 select t.id,t.item_ids,t.priority,(select count(*) from jsonb_each(t.filters) f where jsonb_array_length(f.value)>0) specificity
 from public.portal_uniform_templates t,public.profiles m,public.portal_uniform_items i
 where m.user_id=p_user and i.id=p_item and i.archived_at is null and t.archived_at is null
 and exists(select 1 from public.portal_uniform_categories c where c.id=i.category_id and c.archived_at is null)
 and not exists(select 1 from jsonb_each(t.filters) f where jsonb_array_length(f.value)>0 and not (f.value ? coalesce(to_jsonb(m)->>f.key,'')))
 and exists(select 1 from public.portal_uniform_items sibling where sibling.category_id=i.category_id and sibling.archived_at is null and sibling.id=any(t.item_ids))
 ), best as (select priority,specificity from candidates order by priority desc,specificity desc limit 1)
 select exists(select 1 from candidates c,best b where c.priority=b.priority and c.specificity=b.specificity and p_item=any(c.item_ids))
$$;

create function public.portal_uniform_snapshot(p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.profiles;begin m:=copku_private.uniform_member(p_actor);
 return jsonb_build_object('member',to_jsonb(m)-'email','categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order,c.name) from public.portal_uniform_categories c where c.archived_at is null or exists(select 1 from public.portal_uniform_holdings h where h.category_id=c.id and h.user_id=p_actor) or exists(select 1 from public.portal_uniform_request_lines l where l.category_id=c.id and l.user_id=p_actor and l.decision='pending')),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('eligible',copku_private.uniform_eligible(p_actor,i.id)) order by i.name,i.id) from public.portal_uniform_items i where i.archived_at is null or exists(select 1 from public.portal_uniform_holdings h where h.item_id=i.id and h.user_id=p_actor)),'[]'::jsonb),
 'templates',case when m.role='admin' then coalesce((select jsonb_agg(to_jsonb(t) order by t.priority desc,t.name) from public.portal_uniform_templates t where t.archived_at is null),'[]'::jsonb) else '[]'::jsonb end,
 'holdings',coalesce((select jsonb_agg(to_jsonb(h)) from public.portal_uniform_holdings h where h.user_id=p_actor),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.portal_uniform_request_lines l where l.request_id=r.id),'[]'::jsonb)) order by r.created_at desc) from public.portal_uniform_requests r where r.user_id=p_actor),'[]'::jsonb));end $$;

create function public.portal_uniform_save_category(p_actor uuid,p_id uuid,p_name text,p_expected timestamptz) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.portal_uniform_categories;begin perform copku_private.uniform_admin(p_actor);
 if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'UNIFORM_BAD_CATALOGUE';end if;
 if p_id is null then insert into public.portal_uniform_categories(name,sort_order) values(btrim(p_name),coalesce((select max(sort_order)+1 from public.portal_uniform_categories),0)) returning * into saved;
 else select * into saved from public.portal_uniform_categories where id=p_id and archived_at is null for update;if not found or saved.updated_at is distinct from p_expected then raise exception 'UNIFORM_CHANGED';end if;update public.portal_uniform_categories set name=btrim(p_name),updated_at=clock_timestamp() where id=p_id returning * into saved;end if;
 insert into public.portal_uniform_events(actor,action,entity_id,data) values(p_actor,'save_category',saved.id,to_jsonb(saved));return to_jsonb(saved);end $$;

create function public.portal_uniform_save_item(p_actor uuid,p_id uuid,p_category uuid,p_name text,p_measurements jsonb,p_sizes jsonb,p_image jsonb,p_expected timestamptz) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.portal_uniform_items;field text;size_row jsonb;previous_image jsonb;begin perform copku_private.uniform_admin(p_actor);
 perform 1 from public.portal_uniform_categories where id=p_category and archived_at is null for share;if not found then raise exception 'UNIFORM_BAD_CATALOGUE';end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 80 or jsonb_typeof(p_measurements) is distinct from 'array' or jsonb_array_length(p_measurements)>12 or jsonb_typeof(p_sizes) is distinct from 'array' or jsonb_array_length(p_sizes) not between 1 and 40 then raise exception 'UNIFORM_BAD_SIZES';end if;
 if exists(select 1 from jsonb_array_elements(p_measurements) v where jsonb_typeof(v) is distinct from 'string' or length(btrim(v#>>'{}')) not between 1 and 40)
 or (select count(distinct lower(btrim(v))) from jsonb_array_elements_text(p_measurements) v)<>jsonb_array_length(p_measurements) then raise exception 'UNIFORM_BAD_SIZES';end if;
 for size_row in select value from jsonb_array_elements(p_sizes) loop
  if jsonb_typeof(size_row) is distinct from 'object' or jsonb_typeof(size_row->'label') is distinct from 'string' or length(btrim(size_row->>'label')) not between 1 and 30 or jsonb_typeof(size_row->'values') is distinct from 'object' then raise exception 'UNIFORM_BAD_SIZES';end if;
  for field in select jsonb_array_elements_text(p_measurements) loop
   if jsonb_typeof(size_row->'values'->field) not in('number','string') or length(btrim(coalesce(size_row->'values'->>field,''))) not between 1 and 60 then raise exception 'UNIFORM_BAD_SIZES';end if;
  end loop;
 end loop;
 if (select count(distinct lower(btrim(value->>'label'))) from jsonb_array_elements(p_sizes))<>jsonb_array_length(p_sizes) then raise exception 'UNIFORM_BAD_SIZES';end if;
 if p_id is not null then select * into saved from public.portal_uniform_items where id=p_id and archived_at is null for update;if not found or saved.updated_at is distinct from p_expected or saved.category_id<>p_category then raise exception 'UNIFORM_CHANGED';end if;previous_image:=saved.image;end if;
 if p_image is not null then perform copku_private.validate_resource_media(p_actor,jsonb_build_array(p_image),case when previous_image is null then '[]'::jsonb else jsonb_build_array(previous_image) end,true);end if;
 if p_id is null then insert into public.portal_uniform_items(category_id,name,measurements,sizes,image) values(p_category,btrim(p_name),p_measurements,p_sizes,p_image) returning * into saved;
 else update public.portal_uniform_items set name=btrim(p_name),measurements=p_measurements,sizes=p_sizes,image=p_image,updated_at=clock_timestamp() where id=p_id returning * into saved;end if;
 insert into public.portal_uniform_events(actor,action,entity_id,data) values(p_actor,'save_item',saved.id,to_jsonb(saved));return to_jsonb(saved);end $$;

create function public.portal_uniform_save_template(p_actor uuid,p_id uuid,p_name text,p_filters jsonb,p_priority integer,p_items uuid[],p_expected timestamptz) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.portal_uniform_templates;begin perform copku_private.uniform_admin(p_actor);
 if p_name is null or length(btrim(p_name)) not between 1 and 100 or p_priority is null or p_priority not between -1000 and 1000 or p_items is null or cardinality(p_items) not between 1 and 200 or array_position(p_items,null) is not null or jsonb_typeof(p_filters) is distinct from 'object' then raise exception 'UNIFORM_BAD_TEMPLATE';end if;
 if exists(select 1 from jsonb_each(p_filters) f where f.key not in('department','occupation_type','instrument','classification','rank','member_status') or jsonb_typeof(f.value)<>'array' or jsonb_array_length(f.value)>100) then raise exception 'UNIFORM_BAD_TEMPLATE';end if;
 if exists(select 1 from jsonb_each(p_filters) f cross join lateral jsonb_array_elements(f.value) v where jsonb_typeof(v)<>'string' or length(v#>>'{}')>120) then raise exception 'UNIFORM_BAD_TEMPLATE';end if;
 if exists(select 1 from unnest(p_items) wanted where not exists(select 1 from public.portal_uniform_items i join public.portal_uniform_categories c on c.id=i.category_id where i.id=wanted and i.archived_at is null and c.archived_at is null)) then raise exception 'UNIFORM_BAD_TEMPLATE';end if;
 if p_id is null then insert into public.portal_uniform_templates(name,filters,priority,item_ids) values(btrim(p_name),p_filters,p_priority,p_items) returning * into saved;
 else select * into saved from public.portal_uniform_templates where id=p_id and archived_at is null for update;if not found or saved.updated_at is distinct from p_expected then raise exception 'UNIFORM_CHANGED';end if;update public.portal_uniform_templates set name=btrim(p_name),filters=p_filters,priority=p_priority,item_ids=p_items,updated_at=clock_timestamp() where id=p_id returning * into saved;end if;
 insert into public.portal_uniform_events(actor,action,entity_id,data) values(p_actor,'save_template',saved.id,to_jsonb(saved));return to_jsonb(saved);end $$;

create function public.portal_uniform_archive(p_actor uuid,p_kind text,p_id uuid,p_expected timestamptz) returns void language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz;begin perform copku_private.uniform_admin(p_actor);
 if p_kind='category' then select updated_at into stamp from public.portal_uniform_categories where id=p_id and archived_at is null for update;
 elsif p_kind='item' then select updated_at into stamp from public.portal_uniform_items where id=p_id and archived_at is null for update;
 elsif p_kind='template' then select updated_at into stamp from public.portal_uniform_templates where id=p_id and archived_at is null for update;else raise exception 'UNIFORM_BAD_CATALOGUE';end if;
 if stamp is null or stamp is distinct from p_expected then raise exception 'UNIFORM_CHANGED';end if;
 if p_kind='category' then update public.portal_uniform_categories set archived_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_id;
 elsif p_kind='item' then update public.portal_uniform_items set archived_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_id;
 else update public.portal_uniform_templates set archived_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_id;end if;
 insert into public.portal_uniform_events(actor,action,entity_id) values(p_actor,'archive_'||p_kind,p_id);end $$;

create function public.portal_uniform_submit(p_actor uuid,p_request uuid,p_lines jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.profiles;r public.portal_uniform_requests;i public.portal_uniform_items;h public.portal_uniform_holdings;line jsonb;task uuid;administrator uuid;seen uuid[]:=array[]::uuid[];cname text;begin m:=copku_private.uniform_member(p_actor);
 if p_request is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 20 then raise exception 'UNIFORM_BAD_APPLICATION';end if;
 perform pg_advisory_xact_lock(hashtextextended('uniform-user:'||p_actor::text,0));
 select * into r from public.portal_uniform_requests where user_id=p_actor and request_key=p_request;
 if found then if r.submitted_payload is distinct from p_lines then raise exception 'UNIFORM_REQUEST_CHANGED';end if;return jsonb_build_object('ok',true,'id',r.id,'duplicate',true);end if;
 select user_id into administrator from public.profiles where role='admin' order by user_id limit 1;if administrator is null then raise exception 'UNIFORM_NO_ADMIN';end if;
 insert into public.portal_uniform_requests(user_id,request_key,submitted_payload) values(p_actor,p_request,p_lines) returning * into r;
 for line in select value from jsonb_array_elements(p_lines) loop
  select * into i from public.portal_uniform_items where id=(line->>'item_id')::uuid and archived_at is null;
  if not found or not copku_private.uniform_eligible(p_actor,i.id) or i.category_id=any(seen) then raise exception 'UNIFORM_NOT_ELIGIBLE';end if;seen:=array_append(seen,i.category_id);
  select name into cname from public.portal_uniform_categories where id=i.category_id and archived_at is null;
  if not found or not exists(select 1 from jsonb_array_elements(i.sizes) s where s->>'label'=line->>'size') then raise exception 'UNIFORM_BAD_SIZE';end if;
  if line->>'mode' is null or line->>'mode' not in('new','exchange') or length(btrim(coalesce(line->>'reason',''))) not between 1 and 2000 then raise exception 'UNIFORM_BAD_APPLICATION';end if;
  if exists(select 1 from public.portal_uniform_request_lines where user_id=p_actor and category_id=i.category_id and decision='pending') then raise exception 'UNIFORM_PENDING';end if;
  select * into h from public.portal_uniform_holdings where user_id=p_actor and category_id=i.category_id for update;
  if (line->>'mode'='new' and h.user_id is not null) or (line->>'mode'='exchange' and (h.user_id is null or h.status<>'issued')) then raise exception 'UNIFORM_BAD_MODE';end if;
  insert into public.portal_uniform_request_lines(request_id,user_id,category_id,item_id,size,mode,reason,item_snapshot,previous_record)
   values(r.id,p_actor,i.category_id,i.id,line->>'size',line->>'mode',btrim(line->>'reason'),to_jsonb(i)||jsonb_build_object('category_name',cname),case when h.user_id is null then null else to_jsonb(h) end);
 end loop;
 insert into public.portal_tasks(sender,title,body,kind,starts_at,ends_at,system_action,system_target,system_key)
 values(administrator,left('Review uniform application: '||coalesce(m.full_name,m.username,'Member'),200),jsonb_build_object('text','Review every line in Material → Uniform. Record an approval or rejection for every line to complete this task.'),'information',clock_timestamp(),clock_timestamp()+interval '7 days','uniform_application',r.id,'uniform:'||r.id::text) returning id into task;
 insert into public.portal_task_recipients(task_id,user_id,mandatory,urgent) select task,user_id,true,true from public.profiles where role='admin';
 insert into public.portal_uniform_events(actor,user_id,action,entity_id) values(p_actor,p_actor,'submit',r.id);return jsonb_build_object('ok',true,'id',r.id);end $$;

create function public.portal_uniform_reviews(p_actor uuid,p_request uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$ begin perform copku_private.uniform_admin(p_actor);
 return coalesce((select jsonb_agg(to_jsonb(r)-'submitted_payload'||jsonb_build_object('member',jsonb_build_object('full_name',m.full_name,'username',m.username,'department',m.department,'occupation_type',m.occupation_type,'instrument',m.instrument,'rank',m.rank,'member_status',m.member_status),'lines',(select jsonb_agg(to_jsonb(l) order by l.id) from public.portal_uniform_request_lines l where l.request_id=r.id)) order by r.created_at desc) from public.portal_uniform_requests r join public.profiles m on m.user_id=r.user_id where p_request is null or r.id=p_request),'[]'::jsonb);end $$;

create function public.portal_uniform_decide(p_actor uuid,p_line uuid,p_decision text,p_note text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.portal_uniform_request_lines;owner_id uuid;begin perform copku_private.uniform_admin(p_actor);
 if p_decision is null or p_decision not in('approved','rejected') or p_note is null or length(p_note)>2000 then raise exception 'UNIFORM_BAD_DECISION';end if;
 select user_id into owner_id from public.portal_uniform_request_lines where id=p_line;if not found then raise exception 'UNIFORM_MISSING';end if;
 perform pg_advisory_xact_lock(hashtextextended('uniform-user:'||owner_id::text,0));
 select * into l from public.portal_uniform_request_lines where id=p_line for update;
 if l.decision<>'pending' then if l.decision=p_decision then return jsonb_build_object('ok',true,'duplicate',true);end if;raise exception 'UNIFORM_DECIDED';end if;
 if p_decision='approved' then insert into public.portal_uniform_holdings(user_id,category_id,item_id,size,status,item_snapshot) values(l.user_id,l.category_id,l.item_id,l.size,'ready',l.item_snapshot)
  on conflict(user_id,category_id) do update set item_id=excluded.item_id,size=excluded.size,status='ready',item_snapshot=excluded.item_snapshot,updated_at=clock_timestamp();end if;
 update public.portal_uniform_request_lines set decision=p_decision,decision_note=p_note,decided_by=p_actor,decided_at=clock_timestamp() where id=p_line;
 if not exists(select 1 from public.portal_uniform_request_lines where request_id=l.request_id and decision='pending') then
  update public.portal_tasks set body=body||jsonb_build_object('decision','reviewed') where system_action='uniform_application' and system_target=l.request_id;
  update public.portal_task_recipients set status='completed',reason='Uniform application reviewed' where task_id in(select id from public.portal_tasks where system_action='uniform_application' and system_target=l.request_id);
 end if;
 insert into public.portal_uniform_events(actor,user_id,action,entity_id,data) values(p_actor,l.user_id,p_decision,p_line,jsonb_build_object('note',p_note));return jsonb_build_object('ok',true);end $$;

create function public.portal_uniform_issue(p_actor uuid,p_user uuid,p_category uuid,p_expected timestamptz) returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.portal_uniform_holdings;begin perform copku_private.uniform_admin(p_actor);perform pg_advisory_xact_lock(hashtextextended('uniform-user:'||p_user::text,0));
 select * into h from public.portal_uniform_holdings where user_id=p_user and category_id=p_category for update;
 if not found or h.updated_at is distinct from p_expected or h.status<>'ready' then raise exception 'UNIFORM_CHANGED';end if;
 update public.portal_uniform_holdings set status='issued',updated_at=clock_timestamp() where user_id=p_user and category_id=p_category returning * into h;
 insert into public.portal_uniform_events(actor,user_id,action,entity_id,data) values(p_actor,p_user,'issued',p_category,to_jsonb(h));return to_jsonb(h);end $$;
create function public.portal_uniform_ready(p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$ begin perform copku_private.uniform_admin(p_actor);return coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('member_name',m.full_name) order by h.updated_at) from public.portal_uniform_holdings h join public.profiles m on m.user_id=h.user_id where h.status='ready'),'[]'::jsonb);end $$;

-- Invoker RPCs are callable only by the verified Edge service, never directly by browsers.
do $$ declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname like 'portal_uniform_%') or (n.nspname='copku_private' and p.proname in('uniform_member','uniform_admin','uniform_eligible')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
end loop;end $$;
notify pgrst,'reload schema';
