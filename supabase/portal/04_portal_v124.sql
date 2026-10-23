begin;
-- Personnel details are managed through the authenticated admin function only.
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists occupation_type text;
alter table public.profiles add column if not exists instrument text;
alter table public.profiles add column if not exists classification text;
alter table public.profiles add column if not exists rank text;
alter table public.profiles add column if not exists member_status text not null default 'active';
alter table public.profiles add column if not exists activation_required boolean not null default false;
alter table public.profiles add column if not exists activated_at timestamptz;
create unique index if not exists profiles_username_unique on public.profiles(lower(username)) where username is not null;
-- A protected action is separate from task text supplied by an administrator.
alter table public.portal_tasks add column if not exists system_action text;
alter table public.portal_tasks add column if not exists system_target uuid;
alter table public.portal_tasks add column if not exists system_key text;
create unique index if not exists portal_tasks_system_key on public.portal_tasks(system_key) where system_key is not null;
alter table public.portal_admin_events add column if not exists task_id uuid references public.portal_tasks(id) on delete set null;
create index if not exists portal_admin_events_task_idx on public.portal_admin_events(task_id);
update public.portal_tasks set system_action='club_approval' where system_action is null and title like 'Club registration approval:%' and body->>'text' like 'Review % in Club approvals.%';

create or replace function public.portal_admin_event(p_key text,p_title text,p_text text) returns void language plpgsql security definer set search_path='' as $$
declare t uuid; a uuid; action text; target uuid;
begin
 if p_key ~ '^club:[0-9a-fA-F-]{36}$' then action:='club_approval'; target:=substring(p_key from 6)::uuid; end if;
 insert into public.portal_admin_events(event_key) values(p_key) on conflict do nothing;
 select task_id into t from public.portal_admin_events where event_key=p_key for update;
 if t is null then
  select id into t from public.portal_tasks where system_key=p_key or (system_key is null and title=left(p_title,200) and (body->>'text'=p_text or (action='club_approval' and position(split_part(p_text,' in Club approvals.',1)||' in Club approvals.' in coalesce(body->>'text',''))>0))) order by created_at desc limit 1;
 end if;
 if t is null then
  select user_id into a from public.profiles where role='admin' order by created_at limit 1;
  if a is null then raise exception 'Create the administrator profile first'; end if;
  insert into public.portal_tasks(sender,title,body,kind,starts_at,ends_at,system_action,system_target,system_key) values(a,left(p_title,200),jsonb_build_object('text',p_text),'information',now(),now()+interval '7 days',action,target,p_key) returning id into t;
  insert into public.portal_task_recipients(task_id,user_id,mandatory,urgent) select t,user_id,true,true from public.profiles where role='admin';
 elsif action='club_approval' then
  update public.portal_tasks set system_action=action,system_target=target,system_key=p_key,withdrawn=false where id=t;
  update public.portal_task_recipients set mandatory=true,urgent=true,status=case when status in ('completed','declined') then 'unseen' else status end,reason=null where task_id=t;
 end if;
 update public.portal_admin_events set task_id=t where event_key=p_key;
end $$;
revoke all on function public.portal_admin_event(text,text,text) from public,anon,authenticated;
grant execute on function public.portal_admin_event(text,text,text) to service_role;

create or replace function public.portal_resolve_club_task(p_user uuid,p_decision text,p_email text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_decision not in ('approved','rejected') then raise exception 'An approval decision is required'; end if;
 update public.portal_tasks set system_action='club_approval',system_target=p_user,body=body||jsonb_build_object('decision',p_decision) where system_target=p_user and system_action='club_approval' or system_key='club:'||p_user::text or (system_action='club_approval' and length(p_email)>0 and position('Review '||p_email||' in Club approvals.' in coalesce(body->>'text',''))>0);
 update public.portal_task_recipients set status='completed',reason=p_decision where task_id in (select id from public.portal_tasks where system_action='club_approval' and system_target=p_user);
end $$;
revoke all on function public.portal_resolve_club_task(uuid,text,text) from public,anon,authenticated;
grant execute on function public.portal_resolve_club_task(uuid,text,text) to service_role;

create or replace function public.portal_task_action(p_task uuid,p_action text,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare r public.portal_task_recipients; t public.portal_tasks; feedback uuid;
begin
 if not public.portal_member() then raise exception 'Task unavailable'; end if;
 select * into t from public.portal_tasks where id=p_task for update;
 if t.id is null then raise exception 'Task unavailable'; end if;
 if t.system_action is not null and p_action<>'seen' then raise exception 'Complete the required decision or account activation to resolve this task'; end if;
 if p_action='withdraw' then if t.sender is distinct from auth.uid() then raise exception 'Sender required'; end if; update public.portal_tasks set withdrawn=true where id=p_task; return; end if;
 select * into r from public.portal_task_recipients where task_id=p_task and user_id=auth.uid() for update;
 if r.user_id is null or t.withdrawn then raise exception 'Task unavailable'; end if;
 if p_action='seen' and r.status='unseen' then update public.portal_task_recipients set status='seen' where task_id=p_task and user_id=auth.uid();
 elsif p_action='accept' and r.status in ('unseen','seen') then update public.portal_task_recipients set status='outstanding' where task_id=p_task and user_id=auth.uid();
 elsif p_action='complete' and r.status='outstanding' then update public.portal_task_recipients set status='completed' where task_id=p_task and user_id=auth.uid();
 elsif p_action='decline' and r.status in ('unseen','seen') then
  if r.mandatory and length(trim(p_reason))=0 then raise exception 'A reason is required'; end if;
  update public.portal_task_recipients set status='declined',reason=p_reason where task_id=p_task and user_id=auth.uid();
  insert into public.portal_tasks(sender,title,body,kind,starts_at,ends_at) values(t.sender,left((select coalesce(full_name,email) from public.profiles where user_id=auth.uid())||' has declined your task: '||t.title,200),jsonb_build_object('text',p_reason),'information',now(),now()+interval '7 days') returning id into feedback;
  insert into public.portal_task_recipients(task_id,user_id,mandatory,urgent,status) values(feedback,t.sender,true,false,'unseen');
 else raise exception 'Invalid task transition'; end if;
end $$;
revoke all on function public.portal_task_action(uuid,text,text) from public,anon;
grant execute on function public.portal_task_action(uuid,text,text) to authenticated;

create or replace function public.portal_create_activation_task() returns trigger language plpgsql security definer set search_path='' as $$
declare a uuid; t uuid;
begin
 if new.activation_required and new.role='internal' then
  select user_id into a from public.profiles where role='admin' order by created_at limit 1;
  if a is null then raise exception 'Administrator profile required'; end if;
  insert into public.portal_tasks(sender,title,body,kind,starts_at,ends_at,system_action,system_target,system_key) values(a,'Activate your account: set your password',jsonb_build_object('text','Choose your own password to activate your account. This first password setting does not require administrator approval.'),'information',now(),now()+interval '7 days','password_activation',new.user_id,'activation:'||new.user_id::text) returning id into t;
  insert into public.portal_task_recipients(task_id,user_id,mandatory,urgent) values(t,new.user_id,true,true);
 end if;
 return new;
end $$;
revoke all on function public.portal_create_activation_task() from public,anon,authenticated;
drop trigger if exists portal_activation_task on public.profiles;
create trigger portal_activation_task after insert on public.profiles for each row execute function public.portal_create_activation_task();

create or replace function public.portal_sync_auth_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.email is distinct from old.email then update public.profiles set email=lower(new.email) where user_id=new.id; end if;
 if new.encrypted_password is distinct from old.encrypted_password then
  update public.profiles set activation_required=false,activated_at=now() where user_id=new.id and activation_required;
  if found then update public.portal_task_recipients set status='completed',reason='Account activated' where user_id=new.id and task_id in(select id from public.portal_tasks where system_action='password_activation' and system_target=new.id); end if;
 end if;
 return new;
end $$;
revoke all on function public.portal_sync_auth_profile() from public,anon,authenticated;
drop trigger if exists portal_auth_profile_sync on auth.users;
create trigger portal_auth_profile_sync after update of email,encrypted_password on auth.users for each row execute function public.portal_sync_auth_profile();

-- Reply targets must be in the same notification. Notices never trust a submitted recipient.
alter table public.portal_replies add column if not exists parent_reply_id uuid references public.portal_replies(id) on delete cascade;
create index if not exists portal_replies_parent_idx on public.portal_replies(parent_reply_id);
create table if not exists public.portal_reply_notices(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id) on delete cascade,notification_id uuid not null references public.portal_notifications(id) on delete cascade,reply_id uuid not null references public.portal_replies(id) on delete cascade,replier uuid not null references public.profiles(user_id) on delete cascade,read_at timestamptz,created_at timestamptz not null default now(),unique(user_id,reply_id));
create index if not exists portal_reply_notices_unread on public.portal_reply_notices(user_id,created_at desc) where read_at is null;
create index if not exists portal_reply_notices_notification on public.portal_reply_notices(notification_id);
create index if not exists portal_reply_notices_reply on public.portal_reply_notices(reply_id);
create index if not exists portal_reply_notices_replier on public.portal_reply_notices(replier);
alter table public.portal_reply_notices enable row level security;
revoke all on public.portal_reply_notices from anon,authenticated;
grant select on public.portal_reply_notices to authenticated;
grant update(read_at) on public.portal_reply_notices to authenticated;
grant all on public.portal_reply_notices to service_role;
create policy reply_notices_self_read on public.portal_reply_notices for select to authenticated using(user_id=(select auth.uid()) and public.portal_member());
create policy reply_notices_self_update on public.portal_reply_notices for update to authenticated using(user_id=(select auth.uid()) and public.portal_member()) with check(user_id=(select auth.uid()) and public.portal_member());
create or replace function public.portal_reply_notice_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; target uuid;
begin
 select author into owner from public.portal_notifications where id=new.notification_id;
 if new.parent_reply_id is not null then
  select author into target from public.portal_replies where id=new.parent_reply_id and notification_id=new.notification_id;
  if target is null then raise exception 'Reply target must belong to this notification'; end if;
 end if;
 insert into public.portal_reply_notices(user_id,notification_id,reply_id,replier) select distinct u,new.notification_id,new.id,new.author from unnest(array[owner,target]) u where u is not null and u<>new.author on conflict(user_id,reply_id) do nothing;
 return new;
end $$;
revoke all on function public.portal_reply_notice_trigger() from public,anon,authenticated;
create trigger portal_reply_notice after insert on public.portal_replies for each row execute function public.portal_reply_notice_trigger();

-- Explicit read receipts keep unread counts consistent across sessions and devices.
create table if not exists public.portal_chat_reads(message_id uuid not null references public.portal_chats(id) on delete cascade,user_id uuid not null references public.profiles(user_id) on delete cascade,read_at timestamptz not null default now(),primary key(message_id,user_id));
create index if not exists portal_chat_reads_user_idx on public.portal_chat_reads(user_id);
create index if not exists portal_chats_request_time on public.portal_chats(request_id,created_at desc);
alter table public.portal_chat_reads enable row level security;
revoke all on public.portal_chat_reads from anon,authenticated;
grant select on public.portal_chat_reads to authenticated;
grant all on public.portal_chat_reads to service_role;
create policy chat_reads_self on public.portal_chat_reads for select to authenticated using(user_id=(select auth.uid()) and public.portal_member());
create or replace function public.portal_chat_unread() returns table(person_id uuid,total bigint) language sql stable security definer set search_path='' as $$
 select c.sender,count(*) from public.portal_chats c join public.portal_chat_requests r on r.id=c.request_id where public.portal_member() and r.status='approved' and auth.uid() in(r.sender,r.recipient) and c.sender<>auth.uid() and not exists(select 1 from public.portal_chat_reads seen where seen.message_id=c.id and seen.user_id=auth.uid()) group by c.sender
$$;
create or replace function public.portal_mark_chat_read(p_messages uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.portal_member() or coalesce(array_length(p_messages,1),0)>1000 then raise exception 'Invalid read request'; end if;
 insert into public.portal_chat_reads(message_id,user_id) select c.id,auth.uid() from public.portal_chats c where c.id=any(p_messages) and c.sender<>auth.uid() and public.portal_can_chat(c.request_id) on conflict do nothing;
end $$;
revoke all on function public.portal_chat_unread(),public.portal_mark_chat_read(uuid[]) from public,anon;
grant execute on function public.portal_chat_unread(),public.portal_mark_chat_read(uuid[]) to authenticated;

create table if not exists public.portal_login_limits(key text primary key,started_at timestamptz not null default now(),attempts integer not null default 1);
create index if not exists portal_login_limits_time on public.portal_login_limits(started_at);
alter table public.portal_login_limits enable row level security;
revoke all on public.portal_login_limits from anon,authenticated;
grant all on public.portal_login_limits to service_role;
create or replace function public.portal_login_attempt(p_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_key !~ '^[a-f0-9]{64}$' then return false; end if;
 delete from public.portal_login_limits where started_at<now()-interval '1 day';
 insert into public.portal_login_limits(key) values(p_key) on conflict(key) do update set attempts=case when portal_login_limits.started_at<now()-interval '10 minutes' then 1 else portal_login_limits.attempts+1 end,started_at=case when portal_login_limits.started_at<now()-interval '10 minutes' then now() else portal_login_limits.started_at end returning attempts into n;
 return n<=12;
end $$;
revoke all on function public.portal_login_attempt(text) from public,anon,authenticated;
grant execute on function public.portal_login_attempt(text) to service_role;

-- 10 MB is inclusive. Existing stored files remain downloadable.
update storage.buckets set file_size_limit=10485760 where id in ('portal-files','portal-notification-files');
create or replace function public.portal_validate_notification_attachments() returns trigger language plpgsql set search_path='' as $$
declare a jsonb;
begin
 if jsonb_typeof(new.attachments)<>'array' or jsonb_array_length(new.attachments)>8 then raise exception 'Choose at most eight attachments'; end if;
 for a in select value from jsonb_array_elements(new.attachments) loop
  if jsonb_typeof(a)<>'object' or coalesce(a->>'path','')='' or coalesce(a->>'name','')='' or split_part(a->>'path','/',1)<>new.author::text then raise exception 'Invalid notification attachment'; end if;
  if coalesce(a->>'size','') !~ '^[0-9]+$' or (a->>'size')::bigint<=0 or (a->>'size')::bigint>10485760 then raise exception 'Each attachment must be no larger than 10 MB'; end if;
 end loop;
 return new;
end $$;
-- Personnel validation is appended below before COMMIT.
create or replace function public.portal_validate_member_fields() returns trigger language plpgsql set search_path='' as $$
begin
 if new.username is not null and new.username !~ '^[a-z0-9][a-z0-9._-]{2,39}$' then raise exception 'Invalid username'; end if;
 if new.department is not null and not(new.department=any(array['Orchestra','Windband','Transportation','Safety & Security','Internal affairs','Medic','Scientific research','Special operation','Investigation & Statistics','Intelligence','Editorial board','Logistics & support'])) then raise exception 'Invalid department'; end if;
 if new.department is null and (new.occupation_type is not null or new.instrument is not null) then raise exception 'Department is required'; end if;
 if new.department='Orchestra' and (new.occupation_type is null or not(new.occupation_type=any(array['orchestra-strings','orchestra-woodwind','orchestra-brasswind','percussion']))) then raise exception 'Invalid occupation'; end if;
 if new.department='Windband' and (new.occupation_type is null or not(new.occupation_type=any(array['windband-woodwind','windband-brasswind','percussion']))) then raise exception 'Invalid occupation'; end if;
 if new.department is not null and new.department not in ('Orchestra','Windband') and new.occupation_type is distinct from 'other' then raise exception 'Invalid occupation'; end if;
 if new.occupation_type='orchestra-strings' and (new.instrument is null or not(new.instrument=any(array['Violin','Viola','Cello','Contrabass']))) then raise exception 'Invalid instrument'; end if;
 if new.occupation_type in ('orchestra-woodwind','windband-woodwind') and (new.instrument is null or not(new.instrument=any(array['Flute','Clarinet','Oboe','English horn','Saxophone','Bassoon']))) then raise exception 'Invalid instrument'; end if;
 if new.occupation_type in ('orchestra-brasswind','windband-brasswind') and (new.instrument is null or not(new.instrument=any(array['Trumpet','French horn','Trombone','Tenor horn','Baritone','Tuba']))) then raise exception 'Invalid instrument'; end if;
 if new.occupation_type='percussion' and (new.instrument is null or not(new.instrument=any(array['Timpani','Cymbals','Snare drum','Bass drum']))) then raise exception 'Invalid instrument'; end if;
 if new.occupation_type='other' and new.instrument is not null then raise exception 'Other occupations have no instrument'; end if;
 if new.classification is not null and not(new.classification=any(array['enlist','officer','instructor','civilian'])) then raise exception 'Invalid classification'; end if;
 if new.classification is null and new.rank is not null then raise exception 'Classification is required'; end if;
 if new.classification='enlist' and (new.rank is null or not(new.rank=any(array['Trainee','Private','Private First Class','Corporal','Sergeant','Staff Sergeant','Third Sergeant Major','Second Sergeant Major','First Sergeant Major']))) then raise exception 'Invalid rank'; end if;
 if new.classification='officer' and (new.rank is null or not(new.rank=any(array['Cadet','Second Lieutenant','First Lieutenant','Captain','Major','Lieutenant Colonel','Colonel','Major General','Lieutenant General','General']))) then raise exception 'Invalid rank'; end if;
 if new.classification='civilian' and (new.rank is null or not(new.rank=any(array['Level 3 Junior Staff','Level 2 Junior Staff','Level 1 Junior Staff','Level 3 Intermediate Staff','Level 2 Intermediate Staff','Level 1 Intermediate Staff','Level 3 Senior Staff','Level 2 Senior Staff','Level 1 Senior Staff']))) then raise exception 'Invalid rank'; end if;
 if new.classification='instructor' and (new.rank is null or not(new.rank=any(array['Junior instructor','Intermediate instructor','Senior instructor']))) then raise exception 'Invalid rank'; end if;
 if not(new.member_status=any(array['active','reserve','probationary','retired'])) then raise exception 'Invalid member status'; end if;
 return new;
end $$;
revoke all on function public.portal_validate_member_fields() from public,anon,authenticated;
create trigger portal_member_fields_check before insert or update on public.profiles for each row execute function public.portal_validate_member_fields();
commit;
