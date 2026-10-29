-- Orchestra project: urgent application review tasks and durable email receipts.
begin;
create schema if not exists copku_private;
revoke all on schema copku_private from public,anon,authenticated;
grant usage on schema copku_private to service_role;
create table if not exists public.orchestra_application_mail (
 application_id uuid primary key references public.orchestra_applications(id) on delete cascade,
 status text not null default 'queued' check(status in('queued','sending','sent','failed','uncertain')),
 attempts integer not null default 0 check(attempts>=0),
 claim_token uuid,
 locked_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 provider_message_id text,
 last_error_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists orchestra_application_mail_queue on public.orchestra_application_mail(status,next_attempt_at) where status in('queued','failed');
alter table public.orchestra_application_mail enable row level security;
revoke all on public.orchestra_application_mail from public,anon,authenticated;
grant select,insert,update on public.orchestra_application_mail to service_role;
drop policy if exists orchestra_application_mail_server on public.orchestra_application_mail;
create policy orchestra_application_mail_server on public.orchestra_application_mail for all to service_role using(true) with check(true);

create or replace function public.portal_application_make_review_task(p_application uuid)
 returns void language plpgsql security invoker set search_path='' as $$
declare application public.orchestra_applications;administrator uuid;task uuid;reference text;
begin
 select * into application from public.orchestra_applications where id=p_application for update;
 if not found then raise exception 'Application not found';end if;
 select user_id into administrator from public.profiles where role='admin' order by created_at limit 1;
 if administrator is null then raise exception 'Administrator not configured';end if;
 select id into task from public.portal_tasks where system_key='orchestra-application:'||p_application::text;
 reference:='OA-'||lpad(application.application_no::text,greatest(6,length(application.application_no::text)),'0');
 if task is null then
  insert into public.portal_tasks(sender,title,body,kind,starts_at,ends_at,system_action,system_target,system_key)
   values(administrator,'Review orchestra application: '||reference,jsonb_build_object('text','Review '||application.full_name||' ('||reference||') in Application → Orchestra applications. Record an acceptance or rejection to complete this task.'),'information',now(),now()+interval '7 days','orchestra_application',p_application,'orchestra-application:'||p_application::text) returning id into task;
 end if;
 insert into public.portal_task_recipients(task_id,user_id,mandatory,urgent)
  select task,user_id,true,true from public.profiles where role='admin' on conflict(task_id,user_id) do nothing;
end $$;
create or replace function public.portal_application_after_submit() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 perform public.portal_application_make_review_task(new.id);
 insert into public.orchestra_application_mail(application_id) values(new.id) on conflict do nothing;
 return new;
end $$;
create or replace function public.portal_application_after_review() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if new.review_status in('accepted','rejected') then
  update public.portal_tasks set body=body||jsonb_build_object('decision',new.review_status) where system_action='orchestra_application' and system_target=new.id;
  update public.portal_task_recipients set status='completed',reason=new.review_status,mandatory=true,urgent=true
   where task_id in(select id from public.portal_tasks where system_action='orchestra_application' and system_target=new.id);
 elsif old.review_status in('accepted','rejected') then
  update public.portal_tasks set body=body-'decision',withdrawn=false where system_action='orchestra_application' and system_target=new.id;
  update public.portal_task_recipients set status='unseen',reason=null,mandatory=true,urgent=true
   where task_id in(select id from public.portal_tasks where system_action='orchestra_application' and system_target=new.id);
 end if;
 return new;
end $$;
drop trigger if exists orchestra_application_submitted on public.orchestra_applications;
create trigger orchestra_application_submitted after insert on public.orchestra_applications for each row execute function public.portal_application_after_submit();
drop trigger if exists orchestra_application_reviewed on public.orchestra_applications;
create trigger orchestra_application_reviewed after update of review_status on public.orchestra_applications for each row execute function public.portal_application_after_review();
-- Existing unresolved applications receive admin tasks; historical applicants
-- are not emailed automatically by this installation.
select public.portal_application_make_review_task(id) from public.orchestra_applications where review_status in('pending','reviewing');

-- Vault access is confined to a private function. Browser callers cannot read
-- these functions, even when they have an orchestra session.
create or replace function copku_private.application_mail_config(p_action text,p_actor uuid,p_api_key text,p_sender_email text,p_sender_name text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare settings jsonb:='{}'::jsonb;secret_id uuid;
begin
 select id,decrypted_secret::jsonb into secret_id,settings from vault.decrypted_secrets where name='copku_application_brevo';
 settings:=coalesce(settings,'{}'::jsonb);
 if p_action='save' then
  if not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'Administrator required';end if;
  if p_sender_email is null or p_sender_email!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(p_sender_email)>254 or p_sender_name is null or length(p_sender_name) not between 1 and 120 then raise exception 'Invalid email sender';end if;
  if p_api_key is null or p_api_key='' then p_api_key:=settings->>'api_key';end if;
  if p_api_key is null or length(p_api_key) not between 20 and 2048 then raise exception 'A Brevo API key is required';end if;
  settings:=jsonb_build_object('api_key',p_api_key,'sender_email',lower(trim(p_sender_email)),'sender_name',trim(p_sender_name));
  if secret_id is null then perform vault.create_secret(settings::text,'copku_application_brevo','Application receipt sender; server-only');
  else perform vault.update_secret(secret_id,settings::text);end if;
 elsif p_action not in('status','read') then raise exception 'Invalid email action';end if;
 if p_action='read' then return settings;end if;
 return jsonb_build_object('configured',coalesce(length(settings->>'api_key')>=20,false),'sender_email',coalesce(settings->>'sender_email',''),'sender_name',coalesce(settings->>'sender_name',''));
end $$;
create or replace function public.portal_application_mail_config(p_action text,p_actor uuid default null,p_api_key text default null,p_sender_email text default null,p_sender_name text default null)
 returns jsonb language sql security invoker set search_path='' as $$select copku_private.application_mail_config(p_action,p_actor,p_api_key,p_sender_email,p_sender_name)$$;

create or replace function public.portal_application_mail_claim(p_application uuid default null)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare mail_entry public.orchestra_application_mail;application public.orchestra_applications;token uuid:=gen_random_uuid();
begin
 update public.orchestra_application_mail set status='uncertain',last_error_code='delivery_unknown',updated_at=now() where status='sending' and locked_at<now()-interval '5 minutes';
 select * into mail_entry from public.orchestra_application_mail where (p_application is null or application_id=p_application) and status in('queued','failed') and attempts<6 and next_attempt_at<=now() order by created_at limit 1 for update skip locked;
 if not found then return null;end if;
 update public.orchestra_application_mail set status='sending',claim_token=token,locked_at=now(),attempts=attempts+1,updated_at=now() where application_id=mail_entry.application_id;
 select * into application from public.orchestra_applications where id=mail_entry.application_id;
 return jsonb_build_object('token',token,'application',to_jsonb(application),'attempts',mail_entry.attempts+1);
end $$;
create or replace function public.portal_application_mail_finish(p_application uuid,p_token uuid,p_status text,p_message_id text default null,p_error_code text default null)
 returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_status is null or p_status not in('sent','failed','uncertain') then raise exception 'Invalid email outcome';end if;
 update public.orchestra_application_mail set status=p_status,provider_message_id=left(p_message_id,500),last_error_code=left(p_error_code,120),next_attempt_at=now()+make_interval(mins=>least(60,power(2,least(attempts,6))::integer)),updated_at=now()
  where application_id=p_application and claim_token=p_token and status='sending';
 return found;
end $$;
create or replace function public.portal_application_mail_retry(p_application uuid,p_actor uuid)
 returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'Administrator required';end if;
 if not exists(select 1 from public.orchestra_applications where id=p_application) then raise exception 'Application not found';end if;
 if exists(select 1 from public.orchestra_application_mail where application_id=p_application and status='sending') then raise exception 'This confirmation is still processing';end if;
 insert into public.orchestra_application_mail(application_id) values(p_application)
  on conflict(application_id) do update set status='queued',attempts=0,next_attempt_at=now(),claim_token=null,last_error_code=null,updated_at=now() where orchestra_application_mail.status<>'sent';
end $$;
revoke all on function public.portal_application_make_review_task(uuid),public.portal_application_after_submit(),public.portal_application_after_review(),copku_private.application_mail_config(text,uuid,text,text,text),public.portal_application_mail_config(text,uuid,text,text,text),public.portal_application_mail_claim(uuid),public.portal_application_mail_finish(uuid,uuid,text,text,text),public.portal_application_mail_retry(uuid,uuid) from public,anon,authenticated;
grant execute on function public.portal_application_make_review_task(uuid),copku_private.application_mail_config(text,uuid,text,text,text),public.portal_application_mail_config(text,uuid,text,text,text),public.portal_application_mail_claim(uuid),public.portal_application_mail_finish(uuid,uuid,text,text,text),public.portal_application_mail_retry(uuid,uuid) to service_role;
commit;
