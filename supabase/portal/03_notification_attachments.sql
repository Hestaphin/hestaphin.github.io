begin;
alter table public.portal_notifications add column if not exists attachments jsonb not null default '[]'::jsonb;
insert into storage.buckets(id,name,public,file_size_limit)
values('portal-notification-files','portal-notification-files',false,5242879)
on conflict(id) do update set public=false,file_size_limit=5242879;
create or replace function public.portal_validate_notification_attachments()
returns trigger language plpgsql set search_path='' as $$
declare a jsonb;
begin
 if jsonb_typeof(new.attachments)<>'array' or jsonb_array_length(new.attachments)>8 then raise exception 'Choose at most eight attachments'; end if;
 for a in select value from jsonb_array_elements(new.attachments) loop
  if jsonb_typeof(a)<>'object' or coalesce(a->>'path','')='' or coalesce(a->>'name','')='' or split_part(a->>'path','/',1)<>new.author::text then raise exception 'Invalid notification attachment'; end if;
  if coalesce(a->>'size','') !~ '^[0-9]+$' or (a->>'size')::bigint<=0 or (a->>'size')::bigint>=5242880 then raise exception 'Each attachment must be smaller than 5 MB'; end if;
 end loop;
 return new;
end $$;
drop trigger if exists portal_notification_attachment_check on public.portal_notifications;
create trigger portal_notification_attachment_check before insert or update of attachments on public.portal_notifications for each row execute function public.portal_validate_notification_attachments();
drop policy if exists portal_notification_upload on storage.objects;
create policy portal_notification_upload on storage.objects for insert to authenticated
with check(bucket_id='portal-notification-files' and public.portal_member() and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists portal_notification_download on storage.objects;
create policy portal_notification_download on storage.objects for select to authenticated
using(bucket_id='portal-notification-files' and public.portal_member() and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.portal_notifications n where n.attachments @> jsonb_build_array(jsonb_build_object('path',storage.objects.name)))));
commit;
