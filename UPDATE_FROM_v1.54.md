# COPKU v1.55 — notification table correction

This update-only package requires a complete v1.54 orchestra website.

The v1.54 notification header had a Category column, but each notification row omitted its category cell. That shifted the subject, author, time and action values into the preceding columns. This update renders all five cells and keeps the Actions header cell in the normal table layout. Long subjects can use the full subject column again. Compact row styling, categories, filtering, pagination and author editing remain in place.

The orchestra demo’s Email shortcut now opens the genuine mail sign-in page. The separate mail update removes the email demo itself.

## Install

1. Back up the complete v1.54 website folder.
2. Copy the contents of the ZIP’s inner COPKU_v1.55_Update_Only folder into that complete folder, replacing matching files and retaining all other files.
3. Deploy the entire merged folder to Netlify, then hard-refresh the site.

Do not deploy the small ZIP by itself. No Supabase update or configuration change is needed.

Verification: actual generated notification table markup was checked for five headers and five cells per row, with the correct category/subject/author/time/actions positions, for both admin and member views. Existing category/search/pagination, author editing and moderation UI checks passed. Browser visual verification remains unavailable in the managed preview environment.
