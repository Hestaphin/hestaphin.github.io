-- Run in the separate Club project. Existing registrations and payments are preserved.
begin;
alter table public.club_profiles drop constraint if exists club_profiles_approval_status_check;
alter table public.club_profiles add constraint club_profiles_approval_status_check
 check(approval_status in ('pending','approved','rejected','suspended','revoked'));
alter table public.club_profiles add column if not exists registration_status_at timestamptz;

create table if not exists public.club_registration_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.club_profiles(user_id) on delete cascade,
 previous_status text,
 status text not null check(status in ('pending','approved','rejected','suspended','revoked')),
 actor_id uuid,
 created_at timestamptz not null default now()
);
create index if not exists club_registration_events_user_date on public.club_registration_events(user_id,created_at desc);
alter table public.club_registration_events enable row level security;
revoke all on public.club_registration_events from public,anon,authenticated;
grant select,insert on public.club_registration_events to service_role;
drop policy if exists club_registration_events_server on public.club_registration_events;
create policy club_registration_events_server on public.club_registration_events for all to service_role using(true) with check(true);

-- A private trigger may check Auth email confirmation; no Auth rows are exposed.
create schema if not exists copku_private;
revoke all on schema copku_private from public,anon,authenticated;
grant usage on schema copku_private to service_role;
create or replace function copku_private.club_guard_registration() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if new.approval_status is distinct from old.approval_status then
  if old.approval_status='revoked' then raise exception 'Revocation is permanent. This registration cannot be resumed.'; end if;
  if not ((old.approval_status='pending' and new.approval_status in ('approved','rejected','revoked'))
    or (old.approval_status='approved' and new.approval_status in ('suspended','revoked'))
    or (old.approval_status='suspended' and new.approval_status in ('approved','revoked'))
    or (old.approval_status='rejected' and new.approval_status='revoked')) then
   raise exception 'Invalid registration transition';
  end if;
  if new.approval_status='approved' and not exists(select 1 from auth.users where id=new.user_id and email_confirmed_at is not null) then
   raise exception 'Email confirmation is required before approval';
  end if;
  new.registration_status_at:=now();
 end if;
 return new;
end $$;
create or replace function public.club_audit_registration() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if new.approval_status is distinct from old.approval_status then
  insert into public.club_registration_events(user_id,previous_status,status,actor_id)
   values(new.user_id,old.approval_status,new.approval_status,nullif(current_setting('copku.club_actor',true),'')::uuid);
 end if;
 return new;
end $$;
drop trigger if exists club_registration_guard on public.club_profiles;
create trigger club_registration_guard before update of approval_status on public.club_profiles for each row execute function copku_private.club_guard_registration();
drop trigger if exists club_registration_audit on public.club_profiles;
create trigger club_registration_audit after update of approval_status on public.club_profiles for each row execute function public.club_audit_registration();

create or replace function public.club_change_registration(p_user uuid,p_action text,p_actor uuid,p_expected text)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare profile public.club_profiles; next_status text;
begin
 if p_actor is null then raise exception 'Administrator identity is required'; end if;
 select * into profile from public.club_profiles where user_id=p_user for update;
 if not found then raise exception 'Registration not found'; end if;
 if profile.approval_status is distinct from p_expected then raise exception 'Registration changed. Refresh the list.'; end if;
 next_status:=case
  when p_action in ('approved','rejected') and profile.approval_status='pending' then p_action
  when p_action='suspend' and profile.approval_status='approved' then 'suspended'
  when p_action='resume' and profile.approval_status='suspended' then 'approved'
  when p_action='revoke' and profile.approval_status<>'revoked' then 'revoked'
 end;
 if next_status is null then raise exception 'This registration action is not available'; end if;
 perform set_config('copku.club_actor',p_actor::text,true);
 update public.club_profiles set approval_status=next_status where user_id=p_user returning * into profile;
 return jsonb_build_object('user_id',profile.user_id,'approval_status',profile.approval_status,'registration_status_at',profile.registration_status_at);
end $$;
revoke all on function copku_private.club_guard_registration(),public.club_audit_registration(),public.club_change_registration(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.club_change_registration(uuid,text,uuid,text) to service_role;
-- club_is_approved already requires approval_status='approved' and verified email.
-- Existing JWTs cannot access plans/orders after suspension or revocation.
commit;
