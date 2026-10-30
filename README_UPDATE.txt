# COPKU v1.41 — allow resources with the same name

The connected orchestra Supabase project is already updated. Refresh your
portal: rooms, instruments, equipment and transportation resources can share
the same display name. Each resource's inventory ID remains unique.

## What changed

- Removed the database index that made resource names unique within a category.
- Kept the UUID primary key and case-insensitive inventory ID uniqueness.
- Corrected resource saving to use the UUID returned by the resource writer.
  It no longer looks up a newly created resource by its name. Same-name
  instruments keep their own ID, files, classification, settings and bookings.
- Applied the same behavior to the private demo and updated the source scripts
  used for fresh installation.

Both recorded database migrations and `portal-booking` Edge Function version 9
have been applied. No manual Supabase setup or SQL is required. Existing website
code already benefits from the server fix; the website does not need redeployment
for repeated names to work.

## Keep your website files up to date

This is an update-only package for the complete v1.40 website. Merge the files
inside `COPKU_v1.41_Update_Only` into your existing complete v1.40 website folder
and replace matching files, preserving the remaining files. For a Netlify
redeployment, deploy the merged complete folder. The patch alone is not a full
website. Backend source and recorded migrations are included for version
history; do not reapply migrations already recorded in the connected project.

## Verification

Live database checks passed in all four booking categories: creation and rename
with identical names, correct UUIDs and inventory IDs, case-insensitive duplicate
ID rejection, no partial record after a rejected ID, and independent booking and
cancellation for same-name resources. Test data was rolled back; no fixtures
remain. Classification, stale-write, permission and older-client regression
checks also passed. The security advisory set is unchanged.

Controller/demo checks passed for displaying and opening both same-name items,
separate settings and bookings, classification filtering, resource files and
recurring booking controls. This change does not alter the portal's layout or
the separate email website.
