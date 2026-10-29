-- Historical maintenance file. The connected Orchestra project was repaired manually
-- on 25 October 2026 and verified: pg_net is registered in extensions; cron healthy.
-- No reinstall is required. This file now only checks the extension location.
select e.extname,e.extversion,n.nspname as extension_schema
from pg_extension e join pg_namespace n on n.oid=e.extnamespace
where e.extname='pg_net';
