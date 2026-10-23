begin;
create table if not exists public.shop_orders (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,
 fingerprint text not null,site_origin text not null,items jsonb not null,
 amount_subtotal integer not null check(amount_subtotal>0),currency text not null,
 stripe_checkout_session_id text unique,stripe_payment_intent_id text,
 payment_status text not null default 'pending' check(payment_status in ('pending','paid','failed','expired')),
 customer_email text,customer_name text,shipping_details jsonb,
 paid_at timestamptz,fulfilled_at timestamptz,fulfilled_by uuid references public.profiles(user_id) on delete set null,
 created_at timestamptz not null default now()
);
create table if not exists public.shop_stripe_events(id text primary key,event_type text not null,created_at timestamptz not null default now());
alter table public.shop_orders enable row level security;
alter table public.shop_stripe_events enable row level security;
revoke all on public.shop_orders,public.shop_stripe_events from anon,authenticated;
grant select on public.shop_orders to authenticated;
grant all on public.shop_orders,public.shop_stripe_events to service_role;
drop policy if exists shop_orders_admin_read on public.shop_orders;
create policy shop_orders_admin_read on public.shop_orders for select to authenticated using(public.is_admin(auth.uid()));
create or replace function public.shop_apply_checkout(p_session jsonb,p_event_id text default null,p_event_type text default 'status')
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.shop_orders; email text; new_state text;
begin
 if p_session->'metadata'->>'puco_shop' is distinct from 'v2' then raise exception 'Not a shop checkout'; end if;
 select * into o from public.shop_orders where id=(p_session->'metadata'->>'order_id')::uuid for update;
 if o.id is null then raise exception 'Order not found'; end if;
 if p_session->'metadata'->>'request_id' is distinct from o.request_id::text or p_session->'metadata'->>'site_origin' is distinct from o.site_origin or p_session->>'currency' is distinct from o.currency or (p_session->>'amount_subtotal')::integer is distinct from o.amount_subtotal or (o.stripe_checkout_session_id is not null and o.stripe_checkout_session_id<>p_session->>'id') then raise exception 'Checkout does not match the order'; end if;
 if p_event_id is not null then
  insert into public.shop_stripe_events(id,event_type) values(p_event_id,p_event_type) on conflict do nothing;
  if not found then return jsonb_build_object('paid',o.payment_status='paid','order_id',o.id); end if;
 end if;
 new_state=case when p_session->>'payment_status'='paid' and p_session->>'status'='complete' then 'paid' when p_event_type='checkout.session.async_payment_failed' then 'failed' when p_session->>'status'='expired' then 'expired' else 'pending' end;
 update public.shop_orders set
 stripe_checkout_session_id=p_session->>'id',
 stripe_payment_intent_id=coalesce(p_session->>'payment_intent',stripe_payment_intent_id),
 payment_status=case when payment_status='paid' then 'paid' else new_state end,
 paid_at=case when new_state='paid' then coalesce(paid_at,now()) else paid_at end,
 customer_email=coalesce(p_session->'customer_details'->>'email',p_session->>'customer_email',customer_email),
 customer_name=coalesce(p_session->'customer_details'->>'name',customer_name),
 shipping_details=coalesce(nullif(p_session->'collected_information'->'shipping_details','null'::jsonb),nullif(p_session->'shipping_details','null'::jsonb),shipping_details)
 where id=o.id;
 return jsonb_build_object('paid',new_state='paid' or o.payment_status='paid','order_id',o.id);
end $$;
revoke all on function public.shop_apply_checkout(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.shop_apply_checkout(jsonb,text,text) to service_role;
-- Only the webhook server may read its dedicated encrypted Vault secret.
create or replace function public.shop_webhook_secret() returns text language sql security definer set search_path='' as $$
 select decrypted_secret from vault.decrypted_secrets where name='copku_shop_stripe_webhook' limit 1
$$;
revoke all on function public.shop_webhook_secret() from public,anon,authenticated;
grant execute on function public.shop_webhook_secret() to service_role;
commit;
