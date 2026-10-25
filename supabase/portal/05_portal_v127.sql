begin;
-- Personnel status is enforced even for direct imports or privileged API writes.
create or replace function public.portal_force_training_probationary()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.rank in ('Trainee','Cadet') then new.member_status:='probationary'; end if;
 return new;
end $$;
revoke all on function public.portal_force_training_probationary() from public,anon,authenticated;
drop trigger if exists portal_training_status on public.profiles;
create trigger portal_training_status before insert or update of rank,member_status on public.profiles for each row execute function public.portal_force_training_probationary();
update public.profiles set member_status='probationary' where rank in ('Trainee','Cadet') and member_status<>'probationary';
alter table public.profiles drop constraint if exists profiles_training_status;
alter table public.profiles add constraint profiles_training_status check(rank not in ('Trainee','Cadet') or member_status='probationary');
-- created_at is refreshed for every resend by the existing chat-action RPC.
alter table public.portal_chat_requests add column if not exists recipient_seen_at timestamptz;
create or replace function public.portal_chat_request_unread()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.recipient_seen_at:=null;
 elsif new.status='pending' and (old.status is distinct from new.status or old.sender is distinct from new.sender or old.recipient is distinct from new.recipient or old.created_at is distinct from new.created_at) then new.recipient_seen_at:=null;
 end if;
 return new;
end $$;
revoke all on function public.portal_chat_request_unread() from public,anon,authenticated;
drop trigger if exists portal_chat_request_unread on public.portal_chat_requests;
create trigger portal_chat_request_unread before insert or update on public.portal_chat_requests for each row execute function public.portal_chat_request_unread();
revoke update on public.portal_chat_requests from public,anon,authenticated;
grant update(recipient_seen_at) on public.portal_chat_requests to authenticated;
drop policy if exists requests_mark_own_seen on public.portal_chat_requests;
create policy requests_mark_own_seen on public.portal_chat_requests for update to authenticated using(public.portal_member() and recipient=(select auth.uid()) and status='pending') with check(public.portal_member() and recipient=(select auth.uid()) and status='pending');
create or replace function public.portal_mark_chat_request_seen(p_request uuid,p_created_at timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.portal_member() then raise exception 'Orchestra session required'; end if;
 update public.portal_chat_requests set recipient_seen_at=now()
 where id=p_request and recipient=auth.uid() and status='pending' and created_at=p_created_at and recipient_seen_at is null;
 return found;
end $$;
revoke all on function public.portal_mark_chat_request_seen(uuid,timestamptz) from public,anon;
grant execute on function public.portal_mark_chat_request_seen(uuid,timestamptz) to authenticated;
-- Add only the two chat tables, preserving other publication settings and RLS.
do $$
begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='portal_chat_requests') then alter publication supabase_realtime add table public.portal_chat_requests; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='portal_chats') then alter publication supabase_realtime add table public.portal_chats; end if;
end $$;
commit;
