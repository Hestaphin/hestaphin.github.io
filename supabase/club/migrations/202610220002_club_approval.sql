begin;
alter table public.club_profiles add column approval_status text not null default 'pending' check(approval_status in ('pending','approved','rejected'));
-- Includes existing profiles: review and approve them explicitly.
create or replace function public.club_is_approved() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.club_profiles p join auth.users u on u.id=p.user_id where p.user_id=auth.uid() and p.approval_status='approved' and u.email_confirmed_at is not null) $$;
drop policy club_plan_read_active on public.club_plans;
create policy club_plan_read_active on public.club_plans for select to authenticated using(active and public.club_is_approved());
drop policy club_order_read_self on public.club_orders;
create policy club_order_read_self on public.club_orders for select to authenticated using(user_id=auth.uid() and public.club_is_approved());
commit;
