# COPKU v1.57 — portal loading screen

Requires the complete v1.56 orchestra website.

The portal loading page now centers the supplied Mozart illustration on a white background, with the loading message and estimated percentage below it. The public header and navigation remain visible. Search, decorative score lines and the footer stay hidden during startup; search becomes available once the portal is ready.

The estimate starts while startup scripts load, then advances as authentication, profile checks and the existing parallel portal-data requests complete. While a request is pending, the estimate advances only within a small range. It reaches 100% only after the personal page renders successfully. Failures and redirects stop the estimate; error messages and the existing login behavior remain in place.

## Install

1. Back up your complete v1.56 website folder.
2. Copy everything inside the ZIP's COPKU_v1.57_Update_Only folder into that complete website folder. Replace matching files and keep all other files.
3. Deploy the entire merged folder to Netlify, then hard-refresh the portal.

Do not deploy this small ZIP alone. The new portal/portal-loading.js and assets/portal-loading-mozart.png files must be included. No Supabase or Stripe changes are needed.

Checks passed for admin/member startup, slow authentication, all data-request milestones, failed authentication/data requests, login redirects, timer cleanup, initial search visibility and existing login/portal behavior. Browser visual verification is unavailable because the managed preview service is missing.
