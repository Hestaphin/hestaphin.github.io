-- Remove only the obsolete resource-name uniqueness index. No resource data, UUIDs, inventory ID uniqueness or bookings are removed.
drop index if exists public.portal_booking_resource_name;
notify pgrst,'reload schema';
