-- Safe to run again in the separate CLUB project. Existing decisions are preserved.
begin;
do $$ begin if to_regclass('public.club_profiles') is null then raise exception 'Run this in the Club project after the Club base migration'; end if; end $$;
alter table public.club_profiles add column if not exists approval_status text not null default 'pending';
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.club_profiles'::regclass and conname='club_profiles_approval_status_check') then alter table public.club_profiles add constraint club_profiles_approval_status_check check(approval_status in ('pending','approved','rejected')); end if; end $$;
create or replace function public.club_is_approved() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.club_profiles p join auth.users u on u.id=p.user_id where p.user_id=auth.uid() and p.approval_status='approved' and u.email_confirmed_at is not null) $$;
drop policy if exists club_plan_read_active on public.club_plans;
create policy club_plan_read_active on public.club_plans for select to authenticated using(active and public.club_is_approved());
drop policy if exists club_order_read_self on public.club_orders;
create policy club_order_read_self on public.club_orders for select to authenticated using(user_id=auth.uid() and public.club_is_approved());
revoke all on function public.club_is_approved() from public,anon;
grant execute on function public.club_is_approved() to authenticated,service_role;
grant all on public.club_profiles to service_role;
commit;
