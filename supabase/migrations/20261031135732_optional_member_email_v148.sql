-- A contact email is optional for an administrator-created orchestra member.
-- Multiple NULL values retain the existing unique-email guarantee.
alter table public.profiles alter column email drop not null;
alter table public.profiles add constraint profiles_contact_identity
 check ((email is not null and btrim(email)<>'')
     or (email is null and role='internal' and username is not null));
-- Existing RLS, grants, Auth synchronization and activation tasks are unchanged.
