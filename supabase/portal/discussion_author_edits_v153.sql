-- Author-only edits. Existing post/reply identities and reply targets remain immutable.
alter table public.portal_notifications add column edited_at timestamptz;
alter table public.portal_replies add column edited_at timestamptz;

-- Limit browser UPDATE privileges to the fields offered by the interface.
revoke update on public.portal_notifications,public.portal_replies from public,anon,authenticated;
revoke update(id,author,subject,body,image_path,pinned,created_at,attachments,edited_at) on public.portal_notifications from public,anon,authenticated;
revoke update(id,notification_id,author,body,created_at,parent_reply_id,attachments,edited_at) on public.portal_replies from public,anon,authenticated;
grant update(subject,body,attachments,pinned) on public.portal_notifications to authenticated;
grant update(body,attachments) on public.portal_replies to authenticated;

create policy notification_author_edit on public.portal_notifications for update to authenticated
using(public.portal_member() and author=(select auth.uid()))
with check(public.portal_member() and author=(select auth.uid()));
create policy replies_author_edit on public.portal_replies for update to authenticated
using(public.portal_member() and author=(select auth.uid()))
with check(public.portal_member() and author=(select auth.uid()));

-- The existing admin pin policy also allows UPDATE rows. This guard ensures
-- that its broader row access cannot be used to edit another author's content,
-- and that a non-admin author cannot use their edit policy to pin their post.
create function public.portal_guard_discussion_edit() returns trigger
language plpgsql security invoker set search_path='' as $$
declare content_changed boolean;
begin
 content_changed:=new.body is distinct from old.body or new.attachments is distinct from old.attachments;
 if tg_table_name='portal_notifications' then
  content_changed:=content_changed or new.subject is distinct from old.subject;
  if current_user in ('anon','authenticated') and new.pinned is distinct from old.pinned and not (public.portal_member() and public.is_admin((select auth.uid()))) then
   raise exception 'Only an administrator can pin notifications' using errcode='42501';
  end if;
 end if;
 if content_changed then
  if current_user in ('anon','authenticated') and not coalesce(public.portal_member() and old.author=(select auth.uid()),false) then
   raise exception 'You can edit only your own posts and replies' using errcode='42501';
  end if;
  new.edited_at:=clock_timestamp();
 else new.edited_at:=old.edited_at;
 end if;
 return new;
end $$;
revoke all on function public.portal_guard_discussion_edit() from public,anon,authenticated;
grant execute on function public.portal_guard_discussion_edit() to service_role;
create trigger portal_notification_edit_guard before update on public.portal_notifications for each row execute function public.portal_guard_discussion_edit();
create trigger portal_reply_edit_guard before update on public.portal_replies for each row execute function public.portal_guard_discussion_edit();
