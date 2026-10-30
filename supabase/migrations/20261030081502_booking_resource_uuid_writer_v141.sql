-- COPKU orchestra project: allow repeated resource display names.
-- Keep the UUID primary key and case-insensitive inventory ID unique index.
create or replace function public.portal_booking_save_resource_v135(p_actor uuid,p_id uuid,p_name text,p_category text,p_description text,p_clearance jsonb,p_expected_updated_at timestamptz,p_resource_code text,p_images jsonb,p_attachments jsonb)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare resource public.portal_booking_resources;previous jsonb;saved jsonb;
begin
 if not exists(select 1 from public.profiles where user_id=p_actor and role='admin') then raise exception 'BOOKING_ADMIN_REQUIRED';end if;
 if p_resource_code is null or length(trim(p_resource_code)) not between 1 and 64 then raise exception 'Invalid resource ID';end if;
 if p_id is not null then
  select * into resource from public.portal_booking_resources where id=p_id for update;
  if not found then raise exception 'BOOKING_RESOURCE_MISSING';end if;
  if resource.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_RESOURCE_CHANGED';end if;
  previous:=to_jsonb(resource);
 end if;
 p_images:=copku_private.validate_resource_media(p_actor,p_images,resource.images,true);
 p_attachments:=copku_private.validate_resource_media(p_actor,p_attachments,resource.attachments,false);
 -- Reuse the existing checked, audited, category-preserving resource writer.
 saved:=public.portal_booking_save_resource(p_actor,p_id,p_name,p_category,p_description,p_clearance,p_expected_updated_at);
 -- Always use the returned UUID: several resources can have the same name.
 update public.portal_booking_resources set resource_code=trim(p_resource_code),images=p_images,attachments=p_attachments,updated_at=clock_timestamp() where id=(saved->>'id')::uuid returning * into resource;
 return to_jsonb(resource);
end $$;
revoke all on function public.portal_booking_save_resource_v135(uuid,uuid,text,text,text,jsonb,timestamptz,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.portal_booking_save_resource_v135(uuid,uuid,text,text,text,jsonb,timestamptz,text,jsonb,jsonb) to service_role;
