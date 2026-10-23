# COPKU v1.20 validation

Completed locally on 22 October 2026:

- Compared the starting baseline with the attached v1.19 ZIP byte for byte.
- Confirmed every original source file remains in the release. Public page HTML, images, public-page styles, public-page modules and the contact implementation were preserved.
- Ran Node syntax checks on every JavaScript and MJS source in the release.
- Ran assertions for date-only start/end defaults, explicit hours, invalid date order, missing dates, the strict image limit, unsupported image types, HTML escaping and overdue countdowns.
- Reviewed the schema/API contract: tables use RLS; task status transitions, sends, withdrawals and chat approval changes run through checked database functions; Club approval runs on the server; private files require applicable task/chat access; notifications only accept text and permitted image uploads in the interface and image bucket.
- Reviewed the login client integration to keep the Orchestra session storage key consistent with v1.19.
- Package generation verifies ZIP entries against the source files and runs a ZIP integrity check.

Not verified here:

- Browser rendering and interactions: the managed preview service was unavailable, including its status endpoint. No browser screenshot or successful browser test is claimed.
- SQL execution or permission tests against a running PostgreSQL/Supabase project.
- Deployed Edge Functions, real email delivery, invitation confirmation, cross-project webhook delivery or Stripe transactions.

The ten-step acceptance test in SUPABASE_SETUP_v1.20.md is required after configuring your projects. No live website, database or account was changed by this source update.

Known implementation choices:

- Task body formatting applies to the whole content; it does not support mixed per-word styles.
- Background settings are saved in the current browser, not synchronized between devices.
- Chat refreshes every 15 seconds when no draft is present; the current view displays up to the first 500 messages. A manual Refresh button is included.
- Dates are entered in the user's local timezone and stored as UTC timestamps. With no hour selected, end date means midnight at the start of the next day.
- Old v1.19 internal messages remain in their tables. They are not automatically converted into new tasks, notifications or permission-based chats.
- Booking and Game were navigation labels in the reference pictures without functional instructions. They have not been implemented.
