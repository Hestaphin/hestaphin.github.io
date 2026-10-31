-- Reply files stay in the existing private discussion bucket.
alter table public.portal_replies add column attachments jsonb not null default '[]'::jsonb;
alter table public.portal_replies drop constraint portal_replies_body_check;
alter table public.portal_replies add constraint portal_replies_body_check check(length(body)<=10000);
alter table public.portal_replies add constraint portal_replies_content_check check(length(btrim(body))>0 or (jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)>0));
create index portal_replies_attachments_gin on public.portal_replies using gin(attachments jsonb_path_ops);
create function public.portal_validate_reply_attachments() returns trigger language plpgsql security invoker set search_path='' as $$
declare a jsonb;meta jsonb;seen text[]:=array[]::text[];
begin
 if jsonb_typeof(new.attachments) is distinct from 'array' or jsonb_array_length(new.attachments)>8 then raise exception 'Choose at most eight attachments';end if;
 for a in select value from jsonb_array_elements(new.attachments) loop
  if jsonb_typeof(a) is distinct from 'object' or length(coalesce(a->>'path','')) not between 1 and 1000 or length(coalesce(a->>'name','')) not between 1 and 255 or split_part(a->>'path','/',1)<>new.author::text or (a->>'path')=any(seen) then raise exception 'Invalid reply attachment';end if;
  seen:=array_append(seen,a->>'path');
  if coalesce(a->>'size','') !~ '^[0-9]{1,8}$' or (a->>'size')::bigint not between 1 and 10485760 then raise exception 'Each attachment must be no larger than 10 MB';end if;
  select metadata into meta from storage.objects where bucket_id='portal-notification-files' and name=a->>'path';
  if not found or coalesce(meta->>'size','') !~ '^[0-9]{1,8}$' or (meta->>'size')::bigint is distinct from (a->>'size')::bigint then raise exception 'Reply attachment upload is missing or does not match';end if;
 end loop;
 return new;
end $$;
revoke all on function public.portal_validate_reply_attachments() from public,anon,authenticated;
grant execute on function public.portal_validate_reply_attachments() to service_role;
create trigger portal_reply_attachment_check before insert or update of attachments,author on public.portal_replies for each row execute function public.portal_validate_reply_attachments();
drop policy portal_notification_download on storage.objects;
create policy portal_notification_download on storage.objects for select to authenticated using(bucket_id='portal-notification-files' and public.portal_member() and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.portal_notifications n where n.attachments @> jsonb_build_array(jsonb_build_object('path',storage.objects.name))) or exists(select 1 from public.portal_replies r where r.attachments @> jsonb_build_array(jsonb_build_object('path',storage.objects.name)))));
-- Only unreferenced uploads owned by the caller can be cleaned up after a failed send.
create policy portal_notification_unlinked_delete on storage.objects for delete to authenticated using(bucket_id='portal-notification-files' and public.portal_member() and (storage.foldername(name))[1]=(select auth.uid())::text and not exists(select 1 from public.portal_notifications n where n.attachments @> jsonb_build_array(jsonb_build_object('path',storage.objects.name))) and not exists(select 1 from public.portal_replies r where r.attachments @> jsonb_build_array(jsonb_build_object('path',storage.objects.name))));

-- One holding and pending application per concrete uniform item, not category.
-- Existing holdings and request history are preserved without rewriting rows.
alter table public.portal_uniform_holdings drop constraint portal_uniform_holdings_pkey;
alter table public.portal_uniform_holdings add primary key(user_id,item_id);
create index uniform_holdings_category_user on public.portal_uniform_holdings(category_id,user_id);
alter table public.portal_uniform_request_lines drop constraint portal_uniform_request_lines_request_id_category_id_key;
alter table public.portal_uniform_request_lines add constraint uniform_request_item_unique unique(request_id,item_id);
drop index public.uniform_one_pending_category;
create unique index uniform_one_pending_item on public.portal_uniform_request_lines(user_id,item_id) where decision='pending';

create or replace function public.portal_uniform_submit(p_actor uuid,p_request uuid,p_lines jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.profiles;r public.portal_uniform_requests;i public.portal_uniform_items;h public.portal_uniform_holdings;line jsonb;task uuid;administrator uuid;seen uuid[]:=array[]::uuid[];cname text;reason_code_value text;reason_value text;begin m:=copku_private.uniform_member(p_actor);
 if p_request is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 20 then raise exception 'UNIFORM_BAD_APPLICATION';end if;
 perform pg_advisory_xact_lock(hashtextextended('uniform-user:'||p_actor::text,0));
 select * into r from public.portal_uniform_requests where user_id=p_actor and request_key=p_request;
 if found then if r.submitted_payload is distinct from p_lines then raise exception 'UNIFORM_REQUEST_CHANGED';end if;return jsonb_build_object('ok',true,'id',r.id,'duplicate',true);end if;
 select user_id into administrator from public.profiles where role='admin' order by user_id limit 1;if administrator is null then raise exception 'UNIFORM_NO_ADMIN';end if;
 insert into public.portal_uniform_requests(user_id,request_key,submitted_payload) values(p_actor,p_request,p_lines) returning * into r;
 for line in select value from jsonb_array_elements(p_lines) loop
  select * into i from public.portal_uniform_items where id=(line->>'item_id')::uuid and archived_at is null;
  if not found or not copku_private.uniform_eligible(p_actor,i.id) then raise exception 'UNIFORM_NOT_ELIGIBLE';end if;if i.id=any(seen) then raise exception 'UNIFORM_BAD_APPLICATION';end if;seen:=array_append(seen,i.id);
  select name into cname from public.portal_uniform_categories where id=i.category_id and archived_at is null;
  if not found or not exists(select 1 from jsonb_array_elements(i.sizes) s where s->>'label'=line->>'size') then raise exception 'UNIFORM_BAD_SIZE';end if;
  if line->>'mode' is null or line->>'mode' not in('new','exchange') or length(btrim(coalesce(line->>'reason','')))>2000 then raise exception 'UNIFORM_BAD_APPLICATION';end if;
  reason_code_value:=null;reason_value:='';
  if line->>'mode'='exchange' then
   if line ? 'reason_code' then reason_code_value:=nullif(line->>'reason_code','');
   elsif length(btrim(coalesce(line->>'reason','')))>0 then reason_code_value:='other';end if;
   if reason_code_value is not null and reason_code_value not in('unfit_size','worn','other') then raise exception 'UNIFORM_BAD_REASON';end if;
   reason_value:=case reason_code_value when 'unfit_size' then 'Unfit size' when 'worn' then 'Worn' when 'other' then btrim(coalesce(line->>'reason','')) else '' end;
  end if;
  if exists(select 1 from public.portal_uniform_request_lines where user_id=p_actor and decision='pending' and (item_id=i.id or (mode='exchange' and previous_record->>'item_id'=i.id::text))) then raise exception 'UNIFORM_PENDING';end if;
  select * into h from public.portal_uniform_holdings where user_id=p_actor and item_id=i.id for update;
  if (line->>'mode'='new' and h.user_id is not null) or (line->>'mode'='exchange' and (h.user_id is null or h.status<>'issued')) then raise exception 'UNIFORM_BAD_MODE';end if;
  insert into public.portal_uniform_request_lines(request_id,user_id,category_id,item_id,size,mode,reason,reason_code,item_snapshot,previous_record)
   values(r.id,p_actor,i.category_id,i.id,line->>'size',line->>'mode',reason_value,reason_code_value,to_jsonb(i)||jsonb_build_object('category_name',cname),case when h.user_id is null then null else to_jsonb(h) end);
 end loop;
 insert into public.portal_tasks(sender,title,body,kind,starts_at,ends_at,system_action,system_target,system_key)
 values(administrator,left('Review uniform application: '||coalesce(m.full_name,m.username,'Member'),200),jsonb_build_object('text','Review every line in Material → Uniform. Record an approval or rejection for every line to complete this task.'),'information',clock_timestamp(),clock_timestamp()+interval '7 days','uniform_application',r.id,'uniform:'||r.id::text) returning id into task;
 insert into public.portal_task_recipients(task_id,user_id,mandatory,urgent) select task,user_id,true,true from public.profiles where role='admin';
 insert into public.portal_uniform_events(actor,user_id,action,entity_id) values(p_actor,p_actor,'submit',r.id);return jsonb_build_object('ok',true,'id',r.id);end $$;

create or replace function public.portal_uniform_decide(p_actor uuid,p_line uuid,p_decision text,p_note text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.portal_uniform_request_lines;h public.portal_uniform_holdings;owner_id uuid;source_item uuid;
begin perform copku_private.uniform_admin(p_actor);
 if p_decision is null or p_decision not in('approved','rejected') or p_note is null or length(p_note)>2000 then raise exception 'UNIFORM_BAD_DECISION';end if;
 select user_id into owner_id from public.portal_uniform_request_lines where id=p_line;if not found then raise exception 'UNIFORM_MISSING';end if;
 perform pg_advisory_xact_lock(hashtextextended('uniform-user:'||owner_id::text,0));
 select * into l from public.portal_uniform_request_lines where id=p_line for update;
 if l.decision<>'pending' then if l.decision=p_decision then return jsonb_build_object('ok',true,'duplicate',true);end if;raise exception 'UNIFORM_DECIDED';end if;
 if p_decision='approved' then
  source_item:=coalesce((l.previous_record->>'item_id')::uuid,l.item_id);
  if l.mode='exchange' then
   select * into h from public.portal_uniform_holdings where user_id=l.user_id and item_id=source_item and category_id=l.category_id for update;
   if not found or h.status<>'issued' or h.updated_at is distinct from (l.previous_record->>'updated_at')::timestamptz then raise exception 'UNIFORM_CHANGED';end if;
  end if;
  if (l.mode='new' or source_item<>l.item_id) and exists(select 1 from public.portal_uniform_holdings where user_id=l.user_id and item_id=l.item_id) then raise exception 'UNIFORM_CHANGED';end if;
  -- Preserve the meaning of any historical cross-type exchange still awaiting review.
  if l.mode='exchange' and source_item<>l.item_id then delete from public.portal_uniform_holdings where user_id=l.user_id and item_id=source_item;end if;
  insert into public.portal_uniform_holdings(user_id,category_id,item_id,size,status,item_snapshot) values(l.user_id,l.category_id,l.item_id,l.size,'ready',l.item_snapshot)
   on conflict(user_id,item_id) do update set size=excluded.size,status='ready',item_snapshot=excluded.item_snapshot,updated_at=clock_timestamp();
 end if;
 update public.portal_uniform_request_lines set decision=p_decision,decision_note=p_note,decided_by=p_actor,decided_at=clock_timestamp() where id=p_line;
 if not exists(select 1 from public.portal_uniform_request_lines where request_id=l.request_id and decision='pending') then
  update public.portal_tasks set body=body||jsonb_build_object('decision','reviewed') where system_action='uniform_application' and system_target=l.request_id;
  update public.portal_task_recipients set status='completed',reason='Uniform application reviewed' where task_id in(select id from public.portal_tasks where system_action='uniform_application' and system_target=l.request_id);
 end if;
 insert into public.portal_uniform_events(actor,user_id,action,entity_id,data) values(p_actor,l.user_id,p_decision,p_line,jsonb_build_object('note',p_note));return jsonb_build_object('ok',true);end $$;

create function public.portal_uniform_issue(p_actor uuid,p_user uuid,p_category uuid,p_item uuid,p_expected timestamptz) returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.portal_uniform_holdings;begin perform copku_private.uniform_admin(p_actor);perform pg_advisory_xact_lock(hashtextextended('uniform-user:'||p_user::text,0));
 select * into h from public.portal_uniform_holdings where user_id=p_user and item_id=p_item and category_id=p_category for update;
 if not found or h.updated_at is distinct from p_expected or h.status<>'ready' then raise exception 'UNIFORM_CHANGED';end if;
 update public.portal_uniform_holdings set status='issued',updated_at=clock_timestamp() where user_id=p_user and item_id=p_item returning * into h;
 insert into public.portal_uniform_events(actor,user_id,action,entity_id,data) values(p_actor,p_user,'issued',p_item,to_jsonb(h));return to_jsonb(h);end $$;
-- Older clients can still collect exactly the matching ready record. Never issue
-- all types in a classification when only one row was clicked.
create or replace function public.portal_uniform_issue(p_actor uuid,p_user uuid,p_category uuid,p_expected timestamptz) returns jsonb language plpgsql security invoker set search_path='' as $$
declare ids uuid[];begin perform copku_private.uniform_admin(p_actor);perform pg_advisory_xact_lock(hashtextextended('uniform-user:'||p_user::text,0));
 select array_agg(item_id) into ids from public.portal_uniform_holdings where user_id=p_user and category_id=p_category and status='ready' and updated_at=p_expected;
 if coalesce(cardinality(ids),0)<>1 then raise exception 'UNIFORM_CHANGED';end if;
 return public.portal_uniform_issue(p_actor,p_user,p_category,ids[1],p_expected);end $$;
revoke all on function public.portal_uniform_issue(uuid,uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.portal_uniform_issue(uuid,uuid,uuid,uuid,timestamptz) to service_role;
notify pgrst,'reload schema';
