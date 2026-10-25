begin;
alter table public.shop_orders add column if not exists refunded_amount integer not null default 0 check(refunded_amount>=0);
alter table public.shop_orders add column if not exists refund_pending_amount integer not null default 0 check(refund_pending_amount>=0);
alter table public.shop_orders add column if not exists refund_status text not null default 'none' check(refund_status in ('none','pending','partial','refunded','failed'));
create unique index if not exists shop_orders_payment_intent_unique on public.shop_orders(stripe_payment_intent_id) where stripe_payment_intent_id is not null;
create table if not exists public.shop_refunds (
 stripe_refund_id text primary key,order_id uuid not null references public.shop_orders(id) on delete cascade,
 amount integer not null check(amount>0),currency text not null,
 status text not null check(status in ('pending','requires_action','succeeded','failed','canceled')),
 reason text,failure_reason text,created_at timestamptz not null,updated_at timestamptz not null default now()
);
create index if not exists shop_refunds_order_idx on public.shop_refunds(order_id);
create table if not exists public.shop_refund_requests (
 request_id uuid primary key,order_id uuid not null references public.shop_orders(id) on delete cascade,
 requested_by uuid references public.profiles(user_id) on delete set null,amount integer not null check(amount>0),reason text not null,
 state text not null default 'processing' check(state in ('processing','submitted','failed')),
 stripe_refund_id text,created_at timestamptz not null default now()
);
create index if not exists shop_refund_requests_order_idx on public.shop_refund_requests(order_id);
create unique index if not exists shop_refund_one_processing on public.shop_refund_requests(order_id) where state='processing';
alter table public.shop_refunds enable row level security;
alter table public.shop_refund_requests enable row level security;
revoke all on public.shop_refunds,public.shop_refund_requests from public,anon,authenticated;
grant select on public.shop_refunds,public.shop_refund_requests to authenticated;
grant all on public.shop_refunds,public.shop_refund_requests to service_role;
drop policy if exists shop_refunds_admin_read on public.shop_refunds;
create policy shop_refunds_admin_read on public.shop_refunds for select to authenticated using(public.is_admin((select auth.uid())));
drop policy if exists shop_refund_requests_admin_read on public.shop_refund_requests;
create policy shop_refund_requests_admin_read on public.shop_refund_requests for select to authenticated using(public.is_admin((select auth.uid())));
-- Only authenticated admin Edge Functions can reserve refund requests. The row lock
-- serializes confirmations across administrators, tabs and repeated clicks.
create or replace function public.shop_prepare_refund(p_order uuid,p_request uuid,p_amount integer,p_reason text,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.shop_orders; r public.shop_refund_requests;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'Administrator required'; end if;
 select * into o from public.shop_orders where id=p_order for update;
 if o.id is null or o.payment_status<>'paid' or o.stripe_payment_intent_id is null then raise exception 'Only paid orders can be refunded'; end if;
 if p_amount is null or p_amount<=0 or p_reason not in ('requested_by_customer','duplicate','other') then raise exception 'Invalid refund amount or reason'; end if;
 select * into r from public.shop_refund_requests where request_id=p_request;
 if found then
  if r.order_id<>p_order or r.amount<>p_amount or r.reason<>p_reason then raise exception 'Refund request changed; refresh the order'; end if;
  if r.state='failed' then raise exception 'This request failed; refresh before making a new request'; end if;
  return to_jsonb(r);
 end if;
 if exists(select 1 from public.shop_refund_requests where order_id=p_order and state='processing') then raise exception 'Another refund request is being processed; refresh to retry it'; end if;
 if p_amount>o.amount_subtotal-o.refunded_amount-o.refund_pending_amount then raise exception 'Refund exceeds available amount'; end if;
 insert into public.shop_refund_requests(request_id,order_id,requested_by,amount,reason) values(p_request,p_order,p_actor,p_amount,p_reason) returning * into r;
 return to_jsonb(r);
end $$;
-- Input is a fresh Stripe API Refund object, never browser input. Authoritative
-- PaymentIntent, currency and aggregate limits tie every refund to its shop order.
create or replace function public.shop_apply_refund(p_refund jsonb,p_event_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.shop_orders; r_id text:=p_refund->>'id'; n integer; st text; success_sum integer; pending_sum integer;
begin
 select * into o from public.shop_orders where stripe_payment_intent_id=p_refund->>'payment_intent' for update;
 if o.id is null then return jsonb_build_object('ignored',true); end if;
 n:=(p_refund->>'amount')::integer;st:=p_refund->>'status';
 if r_id !~ '^re_[A-Za-z0-9]+$' or n is null or n<=0 or n>o.amount_subtotal or p_refund->>'currency' is distinct from o.currency or st not in ('pending','requires_action','succeeded','failed','canceled') then raise exception 'Refund does not match order'; end if;
 if exists(select 1 from public.shop_refunds where stripe_refund_id=r_id and (order_id<>o.id or amount<>n or currency<>o.currency)) then raise exception 'Refund identity changed'; end if;
 insert into public.shop_refunds(stripe_refund_id,order_id,amount,currency,status,reason,failure_reason,created_at)
 values(r_id,o.id,n,o.currency,st,p_refund->>'reason',p_refund->>'failure_reason',to_timestamp((p_refund->>'created')::bigint))
 on conflict(stripe_refund_id) do update set status=case when shop_refunds.status in ('succeeded','failed','canceled') and excluded.status in ('pending','requires_action') then shop_refunds.status else excluded.status end, failure_reason=excluded.failure_reason,updated_at=now();
 select coalesce(sum(amount) filter(where status='succeeded'),0),coalesce(sum(amount) filter(where status in ('pending','requires_action')),0) into success_sum,pending_sum from public.shop_refunds where order_id=o.id;
 if success_sum+pending_sum>o.amount_subtotal then raise exception 'Stripe refunds exceed the order amount'; end if;
 update public.shop_orders set refunded_amount=success_sum,refund_pending_amount=pending_sum,
 refund_status=case when pending_sum>0 then 'pending' when success_sum>=amount_subtotal then 'refunded' when success_sum>0 then 'partial' when exists(select 1 from public.shop_refunds where order_id=o.id and status='failed') then 'failed' else 'none' end where id=o.id;
 update public.shop_refund_requests set state='submitted',stripe_refund_id=r_id where order_id=o.id and request_id::text=p_refund->'metadata'->>'copku_refund_request';
 if p_event_id is not null then insert into public.shop_stripe_events(id,event_type) values(p_event_id,'refund') on conflict do nothing; end if;
 return jsonb_build_object('order_id',o.id,'refund_id',r_id,'status',st);
end $$;
create or replace function public.shop_mark_delivered(p_order uuid,p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare o public.shop_orders;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'Administrator required'; end if;
 select * into o from public.shop_orders where id=p_order for update;
 if o.id is null or o.payment_status<>'paid' or o.fulfilled_at is not null or o.refund_pending_amount>0 or o.refunded_amount>=o.amount_subtotal or exists(select 1 from public.shop_refund_requests where order_id=p_order and state='processing') then return false; end if;
 update public.shop_orders set fulfilled_at=now(),fulfilled_by=p_actor where id=p_order;return true;
end $$;
revoke all on function public.shop_prepare_refund(uuid,uuid,integer,text,uuid),public.shop_apply_refund(jsonb,text),public.shop_mark_delivered(uuid,uuid) from public,anon,authenticated;
grant execute on function public.shop_prepare_refund(uuid,uuid,integer,text,uuid),public.shop_apply_refund(jsonb,text),public.shop_mark_delivered(uuid,uuid) to service_role;
commit;
