begin;
create table if not exists public.portal_admin_events(event_key text primary key,created_at timestamptz not null default now());
alter table public.portal_admin_events enable row level security;
create or replace function public.portal_admin_event(p_key text,p_title text,p_text text) returns void language plpgsql security definer set search_path='' as $$ declare t uuid; a uuid; begin
insert into public.portal_admin_events(event_key) values(p_key) on conflict do nothing;
if not found then return; end if;
select user_id into a from public.profiles where role='admin' order by created_at limit 1;
if a is null then raise exception 'Create the administrator profile first'; end if;
insert into public.portal_tasks(sender,title,body,kind,starts_at,ends_at) values(a,left(p_title,200),jsonb_build_object('text',p_text),'information',now(),now()+interval '7 days') returning id into t;
insert into public.portal_task_recipients(task_id,user_id,mandatory,urgent) select t,user_id,true,true from public.profiles where role='admin'; end $$;
revoke all on function public.portal_admin_event(text,text,text) from public,anon,authenticated;
grant execute on function public.portal_admin_event(text,text,text) to service_role;
commit;
