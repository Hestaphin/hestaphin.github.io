# COPKU v1.58 — uniform names and classification grouping

Requires the complete v1.57 orchestra website.

## Fixes

- Current uniform tables use the latest item name, so renaming Type-1 updates the member's uniform row, pending application row and Ready to collect list. Sorting uses the same current name.
- Opening a uniform's details no longer copies its saved details into every classification. The item appears once under its own classification.
- If a live item is unavailable, its saved details remain accessible in its original classification as a historical entry with no live Edit or Delete controls.

Sizes and issue statuses still come from the member's actual record. Original application snapshots remain available in application history.

## Install

1. Back up your complete v1.57 website folder.
2. Merge everything inside COPKU_v1.58_Update_Only into that complete folder, replacing matching files and keeping all other files.
3. Deploy the entire merged folder to Netlify, then hard-refresh the portal.

Do not deploy this small ZIP alone. No Supabase SQL, Edge Function deployment or configuration change is needed. No existing uniform data needs deleting or recreating.

Validation: the original rename bug was reproduced before the fix. Regression checks cover editor renaming, issued and pending rows, collection lists, catalogue grouping/navigation, current-name sorting, archived and historical details, and retained application history. Existing uniform application, review, collection, measurement and template checks pass. Live database reads confirmed that the item name was already saved correctly and the holding's classification matched its item. Browser visual verification is unavailable because the managed preview service is missing.
