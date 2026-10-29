-- Orchestra project. Public submissions go through submit-orchestra-application;
-- only the authenticated administrator's server endpoint reads application data.
begin;
create table if not exists public.orchestra_applications (
 id uuid primary key,
 application_no bigint generated always as identity unique,
 season text not null default '2026 Autumn',
 full_name text not null check(length(full_name) between 1 and 120),
 email text not null check(length(email) between 3 and 254),
 institution text not null check(length(institution) between 1 and 240),
 phone_wechat text not null check(length(phone_wechat) between 1 and 120),
 gender text not null default '' check(length(gender)<=60),
 sections jsonb not null check(jsonb_typeof(sections)='object'),
 review_status text not null default 'pending' check(review_status in ('pending','reviewing','accepted','rejected')),
 admin_notes text not null default '' check(length(admin_notes)<=4000),
 reviewed_by uuid references public.profiles(user_id) on delete set null,
 reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists orchestra_applications_created on public.orchestra_applications(created_at desc);
create index if not exists orchestra_applications_email_date on public.orchestra_applications(lower(email),created_at desc);
create table if not exists public.orchestra_application_limits (
 ip_hash text not null check(length(ip_hash)=64),
 created_at timestamptz not null default now()
);
create index if not exists orchestra_application_limits_ip_date on public.orchestra_application_limits(ip_hash,created_at desc);
alter table public.orchestra_applications enable row level security;
alter table public.orchestra_application_limits enable row level security;
revoke all on public.orchestra_applications,public.orchestra_application_limits from public,anon,authenticated;
revoke all on sequence public.orchestra_applications_application_no_seq from public,anon,authenticated;
grant select,insert,update on public.orchestra_applications to service_role;
grant select,insert,delete on public.orchestra_application_limits to service_role;
grant usage,select on sequence public.orchestra_applications_application_no_seq to service_role;
drop policy if exists orchestra_applications_server on public.orchestra_applications;
create policy orchestra_applications_server on public.orchestra_applications for all to service_role using(true) with check(true);
drop policy if exists orchestra_application_limits_server on public.orchestra_application_limits;
create policy orchestra_application_limits_server on public.orchestra_application_limits for all to service_role using(true) with check(true);

create or replace function public.orchestra_submit_application(p_id uuid,p_payload jsonb,p_ip_hash text)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare application public.orchestra_applications; address text:=lower(trim(p_payload->>'email'));
begin
 if p_id is null or p_ip_hash !~ '^[a-f0-9]{64}$' or address is null then raise exception 'Invalid application'; end if;
 perform pg_advisory_xact_lock(hashtextextended('orchestra-ip:'||p_ip_hash,0));
 perform pg_advisory_xact_lock(hashtextextended('orchestra-email:'||address,0));
 select * into application from public.orchestra_applications where id=p_id;
 if found then
  if application.email<>address then raise exception 'Invalid application'; end if;
  return jsonb_build_object('application_no',application.application_no);
 end if;
 if (select count(*) from public.orchestra_application_limits where ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=10
  or (select count(*) from public.orchestra_application_limits where ip_hash=p_ip_hash and created_at>now()-interval '1 day')>=30
  or (select count(*) from public.orchestra_applications where lower(email)=address and created_at>now()-interval '1 day')>=5 then
  raise exception 'APPLICATION_RATE_LIMIT';
 end if;
 delete from public.orchestra_application_limits where created_at<now()-interval '7 days';
 insert into public.orchestra_application_limits(ip_hash) values(p_ip_hash);
 insert into public.orchestra_applications(id,full_name,email,institution,phone_wechat,gender,sections)
  values(p_id,trim(p_payload->>'full_name'),address,trim(p_payload->>'institution'),trim(p_payload->>'phone_wechat'),coalesce(p_payload->>'gender',''),p_payload->'sections') returning * into application;
 return jsonb_build_object('application_no',application.application_no);
end $$;
revoke all on function public.orchestra_submit_application(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.orchestra_submit_application(uuid,jsonb,text) to service_role;
commit;
