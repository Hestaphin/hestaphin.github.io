-- Existing notifications retain their content and receive the Other category.
alter table public.portal_notifications add column category text not null default 'other' check(category in ('announcement','resource','score','social','other'));
grant update(category) on public.portal_notifications to authenticated;

create or replace function public.portal_guard_discussion_edit() returns trigger
language plpgsql security invoker set search_path='' as $$
declare content_changed boolean;
begin
 content_changed:=new.body is distinct from old.body or new.attachments is distinct from old.attachments;
 if tg_table_name='portal_notifications' then
  content_changed:=content_changed or new.subject is distinct from old.subject or new.category is distinct from old.category;
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
