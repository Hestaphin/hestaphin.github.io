alter table public.profiles
 add column activation_password_set_at timestamptz,
 add column activation_email_verified_at timestamptz;

create table public.portal_activation_emails(
 user_id uuid primary key references public.profiles(user_id) on delete cascade,
 request_id uuid not null unique default gen_random_uuid(),
 email text not null check(email=lower(btrim(email)) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and email not like '%@accounts.pkuco.invalid'),
 code_hash text check(code_hash is null or code_hash ~ '^[a-f0-9]{64}$'),
 code_salt uuid not null,
 state text not null default 'pending' check(state in('pending','applying','verified')),
 attempts integer not null default 0 check(attempts between 0 and 6),
 expires_at timestamptz not null,
 last_sent_at timestamptz not null default now(),
 send_window timestamptz not null default now(),
 send_count integer not null default 1 check(send_count between 1 and 5),
 verified_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.portal_activation_emails enable row level security;
revoke all on public.portal_activation_emails from public,anon,authenticated;
grant all on public.portal_activation_emails to service_role;
create policy activation_email_service on public.portal_activation_emails for all to service_role using(true) with check(true);

create function public.portal_finish_activation(p_user uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.profiles set activation_required=false,activated_at=now()
 where user_id=p_user and role='internal' and activation_required
 and activation_password_set_at is not null and activation_email_verified_at is not null
 and email is not null and email not like '%@accounts.pkuco.invalid';
 if not found then return false;end if;
 update public.portal_task_recipients set status='completed',reason='Account activated: password set and email verified'
 where user_id=p_user and task_id in(select id from public.portal_tasks where system_action='password_activation' and system_target=p_user);
 return true;
end $$;

create or replace function public.portal_sync_auth_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.email is distinct from old.email then
  update public.profiles set email=lower(new.email),activation_email_verified_at=case when activation_required then null else activation_email_verified_at end where user_id=new.id;
 end if;
 if new.encrypted_password is distinct from old.encrypted_password then
  update public.profiles set activation_password_set_at=now() where user_id=new.id and activation_required;
  if found then perform public.portal_finish_activation(new.id);end if;
 end if;
 return new;
end $$;

create or replace function public.portal_create_activation_task() returns trigger
language plpgsql security definer set search_path='' as $$
declare a uuid;t uuid;
begin
 if new.activation_required and new.role='internal' then
  select user_id into a from public.profiles where role='admin' order by created_at limit 1;
  if a is null then raise exception 'Administrator profile required';end if;
  insert into public.portal_tasks(sender,title,body,kind,starts_at,ends_at,system_action,system_target,system_key)
  values(a,'Activate your account: password and verified email',jsonb_build_object('text','Set your own password and verify your email address in this task. Both steps are required. No administrator approval is needed.'),'information',now(),now()+interval '7 days','password_activation',new.user_id,'activation:'||new.user_id::text) returning id into t;
  insert into public.portal_task_recipients(task_id,user_id,mandatory,urgent) values(t,new.user_id,true,true);
 end if;
 return new;
end $$;

create function public.portal_activation_begin_email(p_user uuid,p_email text,p_hash text,p_salt uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.profiles;r public.portal_activation_emails;w timestamptz;c integer;rid uuid:=gen_random_uuid();
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.role<>'internal' or not p.activation_required then raise exception 'ACTIVATION_NOT_PENDING';end if;
 if p_email is null or p_email<>lower(btrim(p_email)) or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_email like '%@accounts.pkuco.invalid' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_salt is null then raise exception 'ACTIVATION_BAD_EMAIL';end if;
 if exists(select 1 from public.profiles where email=p_email and user_id<>p_user) then raise exception 'ACTIVATION_EMAIL_IN_USE';end if;
 select * into r from public.portal_activation_emails where user_id=p_user for update;
 if found then
  if r.state='applying' and r.updated_at>now()-interval '30 seconds' then raise exception 'ACTIVATION_BUSY';end if;
  if r.last_sent_at>now()-interval '60 seconds' then raise exception 'ACTIVATION_COOLDOWN';end if;
  if r.send_window>now()-interval '1 hour' then w:=r.send_window;c:=r.send_count+1;else w:=now();c:=1;end if;
 else w:=now();c:=1;end if;
 if c>5 then raise exception 'ACTIVATION_SEND_LIMIT';end if;
 insert into public.portal_activation_emails(user_id,request_id,email,code_hash,code_salt,state,attempts,expires_at,last_sent_at,send_window,send_count,verified_at,updated_at)
 values(p_user,rid,p_email,p_hash,p_salt,'pending',0,now()+interval '10 minutes',now(),w,c,null,now())
 on conflict(user_id) do update set request_id=excluded.request_id,email=excluded.email,code_hash=excluded.code_hash,code_salt=excluded.code_salt,state=excluded.state,attempts=0,expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at,send_window=excluded.send_window,send_count=excluded.send_count,verified_at=null,updated_at=now();
 update public.profiles set activation_email_verified_at=null where user_id=p_user;
 return jsonb_build_object('request_id',rid,'email',p_email,'expires_at',now()+interval '10 minutes');
end $$;

create function public.portal_activation_check_email(p_user uuid,p_request uuid,p_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.portal_activation_emails;
begin
 perform 1 from public.profiles where user_id=p_user and role='internal' and activation_required for update;
 if not found then return jsonb_build_object('ok',false);end if;
 select * into r from public.portal_activation_emails where user_id=p_user for update;
 if not found or r.request_id<>p_request or r.state='verified' or r.expires_at<now() or r.attempts>=6 or p_hash is null then return jsonb_build_object('ok',false);end if;
 if r.code_hash is distinct from p_hash then
  update public.portal_activation_emails set attempts=attempts+1,updated_at=now() where user_id=p_user;
  return jsonb_build_object('ok',false);
 end if;
 update public.portal_activation_emails set state='applying',verified_at=coalesce(verified_at,now()),updated_at=now() where user_id=p_user;
 return jsonb_build_object('ok',true,'request_id',r.request_id,'email',r.email);
end $$;

create function public.portal_activation_finish_email(p_user uuid,p_request uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare p public.profiles;r public.portal_activation_emails;
begin
 select * into p from public.profiles where user_id=p_user for update;
 if not found or p.role<>'internal' or not p.activation_required then return false;end if;
 select * into r from public.portal_activation_emails where user_id=p_user for update;
 if not found or r.request_id<>p_request or r.state<>'applying' or r.verified_at is null or r.email is distinct from p.email then return false;end if;
 update public.portal_activation_emails set state='verified',code_hash=null,updated_at=now() where user_id=p_user;
 update public.profiles set activation_email_verified_at=now() where user_id=p_user;
 perform public.portal_finish_activation(p_user);
 return true;
end $$;

revoke all on function public.portal_finish_activation(uuid),public.portal_activation_begin_email(uuid,text,text,uuid),public.portal_activation_check_email(uuid,uuid,text),public.portal_activation_finish_email(uuid,uuid) from public,anon,authenticated;
grant execute on function public.portal_finish_activation(uuid),public.portal_activation_begin_email(uuid,text,text,uuid),public.portal_activation_check_email(uuid,uuid,text),public.portal_activation_finish_email(uuid,uuid) to service_role;

update public.portal_tasks t set title='Activate your account: password and verified email',body=jsonb_build_object('text','Set your own password and verify your email address in this task. Both steps are required. No administrator approval is needed.')
where system_action='password_activation' and exists(select 1 from public.profiles p where p.user_id=t.system_target and p.role='internal' and p.activation_required);
