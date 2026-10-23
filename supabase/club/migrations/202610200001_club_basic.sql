-- COPKU v1.19: run ONLY in the new, separate Club Supabase project.
-- The original orchestra schema, accounts and policies are not changed.
begin;

do $$ begin
  if to_regclass('public.internal_messages') is not null or to_regclass('public.profiles') is not null then
    raise exception 'Use a NEW Club project. Do not run this migration in the orchestra project.';
  end if;
end $$;

create table if not exists public.club_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  account_type text not null default 'club' check (account_type = 'club'),
  membership_tier text not null default 'Membership Basic'
    check (membership_tier in ('Membership Basic', 'Membership Standard', 'Membership Supporter', 'Membership Patron')),
  membership_status text not null default 'basic'
    check (membership_status in ('basic', 'active', 'expired', 'cancelled')),
  paid_through timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('Membership Standard', 'Membership Supporter', 'Membership Patron')),
  name text not null,
  description text not null default '',
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'cny' check (currency ~ '^[a-z]{3}$'),
  stripe_price_id text unique,
  duration_months integer not null default 12 check (duration_months between 1 and 120),
  sort_order integer not null check (sort_order between 1 and 3),
  active boolean not null default false,
  check (not active or stripe_price_id like 'price_%')
);

create table if not exists public.club_checkout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.club_profiles(user_id) on delete cascade,
  plan_id uuid not null references public.club_plans(id),
  plan_slug text not null,
  plan_name text not null,
  plan_rank integer not null check (plan_rank between 1 and 3),
  duration_months integer not null check (duration_months between 1 and 120),
  stripe_price_id text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null,
  stripe_checkout_session_id text unique,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'cancelled')),
  fulfilled_at timestamptz,
  created_at timestamptz not null default now()
);
-- One open checkout per account prevents a late, lower-tier purchase after an upgrade.
create unique index if not exists club_one_pending_checkout
  on public.club_checkout_requests(user_id) where payment_status = 'pending';

create table if not exists public.club_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.club_profiles(user_id) on delete cascade,
  checkout_request_id uuid not null unique references public.club_checkout_requests(id),
  plan_id uuid not null references public.club_plans(id),
  plan_name text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  paid_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists club_orders_user_paid on public.club_orders(user_id, paid_at desc);

alter table public.club_profiles enable row level security;
alter table public.club_plans enable row level security;
alter table public.club_checkout_requests enable row level security;
alter table public.club_orders enable row level security;
revoke all on public.club_profiles, public.club_plans, public.club_checkout_requests, public.club_orders from anon, authenticated;
grant select on public.club_profiles, public.club_plans, public.club_orders to authenticated;
grant all on public.club_profiles, public.club_plans, public.club_checkout_requests, public.club_orders to service_role;

drop policy if exists club_profile_read_self on public.club_profiles;
create policy club_profile_read_self on public.club_profiles for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists club_plan_read_active on public.club_plans;
create policy club_plan_read_active on public.club_plans for select to authenticated using (active);
drop policy if exists club_order_read_self on public.club_orders;
create policy club_order_read_self on public.club_orders for select to authenticated
  using (user_id = (select auth.uid()));
-- No browser INSERT/UPDATE policies: users cannot grant themselves paid access.

create or replace function public.club_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.club_profiles (user_id, email, full_name, account_type, membership_tier, membership_status)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data->>'full_name', ''), 120),
          'club', 'Membership Basic', 'basic');
  return new;
end;
$$;
revoke all on function public.club_new_auth_user() from public, anon, authenticated;
drop trigger if exists club_after_auth_signup on auth.users;
create trigger club_after_auth_signup after insert on auth.users
  for each row execute function public.club_new_auth_user();

create or replace function public.club_sync_auth_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.club_profiles set email = coalesce(new.email, ''), updated_at = now() where user_id = new.id;
  return new;
end;
$$;
revoke all on function public.club_sync_auth_email() from public, anon, authenticated;
drop trigger if exists club_after_auth_email on auth.users;
create trigger club_after_auth_email after update of email on auth.users
  for each row execute function public.club_sync_auth_email();

-- Backfill accounts if the migration is re-run after Auth users already exist.
insert into public.club_profiles(user_id, email, full_name)
select id, coalesce(email, ''), left(coalesce(raw_user_meta_data->>'full_name', ''), 120) from auth.users
on conflict (user_id) do nothing;

-- Keep the established paid prices. Activate only after replacing Stripe price IDs.
insert into public.club_plans(slug, name, description, price_cents, sort_order)
values
 ('Membership Standard', 'Membership Standard', 'Annual Club membership with magazine and shop benefits.', 19900, 1),
 ('Membership Supporter', 'Membership Supporter', 'Annual supporter membership with additional souvenirs and benefits.', 39900, 2),
 ('Membership Patron', 'Membership Patron', 'Annual patron membership for the highest supporter level.', 99900, 3)
on conflict (slug) do nothing;

-- A Stripe-verified, service-only, transactional fulfillment path.
-- Row locks + the unique checkout/order keys make repeated and concurrent webhooks safe.
create or replace function public.fulfill_club_checkout(
  p_request_id uuid, p_session_id text, p_payment_intent_id text,
  p_amount_total integer, p_currency text, p_paid_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  request public.club_checkout_requests%rowtype;
  profile public.club_profiles%rowtype;
  next_paid_through timestamptz;
begin
  select * into request from public.club_checkout_requests where id = p_request_id for update;
  if not found then raise exception 'Unknown Club checkout'; end if;
  if request.stripe_checkout_session_id is not null and request.stripe_checkout_session_id <> p_session_id then
    raise exception 'Checkout session does not match request';
  end if;
  if request.amount_cents <> p_amount_total or request.currency <> lower(p_currency) then
    raise exception 'Checkout amount or currency does not match';
  end if;
  if request.fulfilled_at is not null then
    return jsonb_build_object('fulfilled', true, 'duplicate', true);
  end if;
  if request.payment_status <> 'pending' then raise exception 'Checkout is no longer pending'; end if;
  if nullif(p_session_id, '') is null or p_paid_at is null then raise exception 'Missing payment details'; end if;
  select * into profile from public.club_profiles where user_id = request.user_id for update;
  if not found then raise exception 'Club profile does not exist'; end if;
  -- Payment timestamps come from the verified Stripe event, never the browser.
  if profile.membership_status = 'active' and profile.membership_tier = request.plan_name and profile.paid_through > p_paid_at then
    next_paid_through := profile.paid_through + make_interval(months => request.duration_months);
  else
    next_paid_through := p_paid_at + make_interval(months => request.duration_months);
  end if;
  insert into public.club_orders(user_id, checkout_request_id, plan_id, plan_name, amount_cents, currency,
    stripe_checkout_session_id, stripe_payment_intent_id, paid_at)
  values (request.user_id, request.id, request.plan_id, request.plan_name, request.amount_cents, request.currency,
    p_session_id, p_payment_intent_id, p_paid_at);
  update public.club_profiles set membership_tier = request.plan_name, membership_status = 'active',
    paid_through = next_paid_through, updated_at = now() where user_id = request.user_id;
  update public.club_checkout_requests set payment_status = 'paid', fulfilled_at = now(),
    stripe_checkout_session_id = p_session_id where id = request.id;
  return jsonb_build_object('fulfilled', true, 'duplicate', false, 'paid_through', next_paid_through);
end;
$$;
revoke all on function public.fulfill_club_checkout(uuid,text,text,integer,text,timestamptz) from public, anon, authenticated;
grant execute on function public.fulfill_club_checkout(uuid,text,text,integer,text,timestamptz) to service_role;

commit;
