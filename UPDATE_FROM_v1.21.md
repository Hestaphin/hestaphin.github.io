# COPKU v1.22 update

This update makes the portal search use the same controls and shared stylesheet as the About page. It adds the year wheel, direct year entry, All years, season selections, month range, SEARCH button and triangular collapse control. Desktop and mobile panel geometry comes from the same `events/events.css` file used by About. The About page and its original stylesheet/model are unchanged.

Portal search covers the signed-in user's accessible tasks, notifications and orchestra member directory. It uses task start dates, notification posting dates and member join dates. The search results open the corresponding task, notification or conversation. Closing the panel returns to the portal and restores the previous scroll position. Permissions remain governed by the existing Supabase policies.

## Upload the update

Keep your current configured `config.js` and `CNAME`. Replace the entire `portal` folder with this package's `portal` folder, including the new `portal/search.mjs` file. Keep the existing `events` folder: the portal now deliberately shares `events/events.css` and `events/events-model.mjs` with About. Those files are also present unchanged in this complete ZIP.

You do not need additional SQL or new Edge Functions for this update. Your SMTP credentials are stored in Supabase; uploading the ZIP does not repair SMTP settings. Follow `SMTP_FIX_BREVO.md` for the Brevo setup and the exact log entry needed to diagnose a recovery-email error.

After publishing, reload the portal once with Ctrl+Shift+R on Windows or Command+Shift+R on Mac. Portal entry points and new modules use the `v=1.22` query parameter.

## Verification

JavaScript syntax checks and tests for portal views, search filters and sample task/chat actions passed locally. The portal search control tree was compared with About's control tree, and the shared About/Events stylesheet and model were verified unchanged. Browser rendering remains unverified because the managed preview service was unavailable. Live SMTP delivery has not been tested or reconfigured here.
