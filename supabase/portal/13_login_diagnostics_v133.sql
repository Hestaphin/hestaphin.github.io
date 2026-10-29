-- READ ONLY: no passwords, tokens, row deletion, or configuration changes.
select 1 as database_responding;

select
 to_regprocedure('public.portal_login_attempt(text)') is not null as login_check_installed,
 to_regclass('public.portal_login_limits') is not null as login_limit_table_installed;

select state, wait_event_type, wait_event, count(*) as connections
from pg_stat_activity
where datname=current_database() and pid<>pg_backend_pid()
group by state,wait_event_type,wait_event
order by connections desc;

select pid,state,wait_event_type,wait_event,
 pg_blocking_pids(pid) as blocked_by,
 extract(epoch from (clock_timestamp()-query_start))::integer as seconds_running
from pg_stat_activity
where datname=current_database() and pid<>pg_backend_pid()
 and (query ilike '%portal_login_attempt%' or query ilike '%portal_login_limits%')
order by query_start
limit 20;
