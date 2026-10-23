# COPKU v1.23 update

The portal uses the v1.19 website and the corrected drawn portal layout from v1.21/v1.22. This is a complete website package.

## Publish the website files

1. Extract `COPKU_Website_v1.23.zip`.
2. Upload the contents of its `COPKU_Website_v1.23` folder into your website repository. Do not upload the outer folder as an extra website level.
3. Keep your current `config.js` and `CNAME` if you have customized them. This package's public configuration now matches the connected COPKU DATA and COPKU Club projects; it contains no server keys.
4. Publish through your existing GitHub Pages process. Then hard refresh the portal once: Ctrl+Shift+R on Windows, Command+Shift+R on Mac.

For a smaller upload, replace the complete `portal/` and `shop/` folders. Keep the existing `events/` folder, because portal search shares About's Events stylesheet and filter model. The complete ZIP preserves the original pages and assets.

## Already applied to your connected accounts

| Project / account | Applied on 23 October 2026 |
| --- | --- |
| COPKU Club | Added the missing `approval_status` column, approval checks and policies. The existing applicant remains pending. |
| COPKU DATA | Added notification attachment metadata and the private `portal-notification-files` bucket, with a maximum file size of 5 MB minus one byte. |
| COPKU DATA | Updated `portal-admin` so readable applications remain visible if reminder creation fails, and errors explain the actual problem. Added shop order administration. |
| COPKU DATA | Added shop order tables, service-only payment confirmation and encrypted webhook secret access. Deployed `create-shop-checkout` and `shop-stripe-webhook`. |
| COPKU Stripe, live | Created the one-time US$5.00 textbook price and an enabled payment webhook. |

You do not need to repeat the original v1.20 setup or rerun its base schemas. The new SQL and function source are included for your records and for restoring this configuration later. See `SUPABASE_SETUP_v1.23.md`.

## Use the updated portal

- Search opens the About-style filter panel. Search your accessible tasks, notifications and members by keywords, year, seasons and months. Select a result to open it; collapse the panel to return.
- Notifications accept images, PDF, Word, spreadsheets, audio and other files. Each file must be smaller than 5 MB; a notification can contain up to eight files. Existing image notifications still open.
- Enter task times to the minute, for example 13:15–14:45. An empty start time means midnight; an empty end time includes the selected end day.
- Contact uses smaller text and a conversation that scrolls inside its panel. Add attachment and Send remain below the message box within the viewport.
- Log out is beside your name in the black sidebar.
- Administrators can open Settings → Club approvals to review the waiting registration. Email verification and administrator approval are separate requirements.
- Administrators can open Settings → Shop orders to see paid orders and mark an order delivered after arranging delivery.

## Verification and limits

Portal/search/demo behavior, minute entry, file boundaries and shop handlers passed automated checks. Live Supabase checks verified the missing approval column repair, private attachment bucket, order permissions, payment validation and duplicate-event handling. A correctly signed verification request reached the live shop webhook successfully. No real payment was charged, and temporary database test rows were rolled back.

Browser visual QA could not run because the managed preview service was unavailable. Review the updated private portal demo before publishing your public website.

An attempted change to the separate Club membership checkout's legacy JWT setting was blocked by automatic approval review because it could affect membership purchases. The live Club checkout setting remains unchanged. This does not undo the registration approval database repair or the new textbook shop integration.
