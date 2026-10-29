-- Orchestra project: automatic receipt processing each minute. No mail API key
-- is embedded here; administrators save the verified sender in the portal.
begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
do $$begin
 if not exists(select 1 from vault.secrets where name='copku_application_mail_worker') then
  perform vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'copku_application_mail_worker','Private application receipt worker authorization');
 end if;
end $$;
create or replace function copku_private.application_mail_worker_token() returns text
 language sql security definer set search_path='' as $$select decrypted_secret from vault.decrypted_secrets where name='copku_application_mail_worker'$$;
create or replace function public.portal_application_mail_worker_token() returns text
 language sql security invoker set search_path='' as $$select copku_private.application_mail_worker_token()$$;
create or replace function copku_private.enqueue_application_mail_worker() returns bigint
 language plpgsql security definer set search_path='' as $$
begin
 return net.http_post(url:='https://mqthckhoxtqtyuhtdunl.supabase.co/functions/v1/application-mail-worker',headers:=jsonb_build_object('Content-Type','application/json','x-copku-mail-worker',copku_private.application_mail_worker_token()),body:='{}'::jsonb,timeout_milliseconds:=60000);
end $$;
revoke all on function copku_private.application_mail_worker_token(),public.portal_application_mail_worker_token(),copku_private.enqueue_application_mail_worker() from public,anon,authenticated;
grant execute on function copku_private.application_mail_worker_token(),public.portal_application_mail_worker_token() to service_role;
-- The cron command contains no credential. Its private function reads Vault.
select cron.schedule('copku-application-confirmations','* * * * *','select copku_private.enqueue_application_mail_worker();');
commit;
