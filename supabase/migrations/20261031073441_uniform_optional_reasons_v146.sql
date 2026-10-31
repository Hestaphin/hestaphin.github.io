-- Optional reasons; new applications do not require or store a reason.
-- Historical rows and original retry payloads remain intact.
alter table public.portal_uniform_request_lines drop constraint portal_uniform_request_lines_reason_check;
alter table public.portal_uniform_request_lines alter column reason set default '';
alter table public.portal_uniform_request_lines add constraint portal_uniform_request_lines_reason_check check(length(reason)<=2000);
alter table public.portal_uniform_request_lines add column reason_code text
 constraint portal_uniform_reason_code_check check(reason_code is null or (mode='exchange' and reason_code in('unfit_size','worn','other')));
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
  if not found or not copku_private.uniform_eligible(p_actor,i.id) or i.category_id=any(seen) then raise exception 'UNIFORM_NOT_ELIGIBLE';end if;seen:=array_append(seen,i.category_id);
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
  if exists(select 1 from public.portal_uniform_request_lines where user_id=p_actor and category_id=i.category_id and decision='pending') then raise exception 'UNIFORM_PENDING';end if;
  select * into h from public.portal_uniform_holdings where user_id=p_actor and category_id=i.category_id for update;
  if (line->>'mode'='new' and h.user_id is not null) or (line->>'mode'='exchange' and (h.user_id is null or h.status<>'issued')) then raise exception 'UNIFORM_BAD_MODE';end if;
  insert into public.portal_uniform_request_lines(request_id,user_id,category_id,item_id,size,mode,reason,reason_code,item_snapshot,previous_record)
   values(r.id,p_actor,i.category_id,i.id,line->>'size',line->>'mode',reason_value,reason_code_value,to_jsonb(i)||jsonb_build_object('category_name',cname),case when h.user_id is null then null else to_jsonb(h) end);
 end loop;
 insert into public.portal_tasks(sender,title,body,kind,starts_at,ends_at,system_action,system_target,system_key)
 values(administrator,left('Review uniform application: '||coalesce(m.full_name,m.username,'Member'),200),jsonb_build_object('text','Review every line in Material → Uniform. Record an approval or rejection for every line to complete this task.'),'information',clock_timestamp(),clock_timestamp()+interval '7 days','uniform_application',r.id,'uniform:'||r.id::text) returning id into task;
 insert into public.portal_task_recipients(task_id,user_id,mandatory,urgent) select task,user_id,true,true from public.profiles where role='admin';
 insert into public.portal_uniform_events(actor,user_id,action,entity_id) values(p_actor,p_actor,'submit',r.id);return jsonb_build_object('ok',true,'id',r.id);end $$;

revoke all on function public.portal_uniform_submit(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.portal_uniform_submit(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
