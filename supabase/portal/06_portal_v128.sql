begin;
-- Members may remove their own content; administrators may moderate all content.
revoke delete on public.portal_notifications,public.portal_replies from public,anon;
grant delete on public.portal_notifications,public.portal_replies to authenticated;
drop policy if exists notification_delete on public.portal_notifications;
create policy notification_delete on public.portal_notifications for delete to authenticated
using(public.portal_member() and (author=(select auth.uid()) or public.is_admin((select auth.uid()))));
drop policy if exists replies_delete on public.portal_replies;
create policy replies_delete on public.portal_replies for delete to authenticated
using(public.portal_member() and (author=(select auth.uid()) or public.is_admin((select auth.uid()))));
-- Deleting one reply must not also delete replies authored by other members.
alter table public.portal_replies drop constraint if exists portal_replies_parent_reply_id_fkey;
alter table public.portal_replies add constraint portal_replies_parent_reply_id_fkey
foreign key(parent_reply_id) references public.portal_replies(id) on delete set null;
commit;
