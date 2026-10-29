# COPKU v1.21 portal layout update

This update replaces the old rounded inbox dashboard with the portal layout in your instruction drawings. It retains the v1.20 Supabase tables and functions. You do not need to rerun SQL for this update.

## Apply the update to pkuco.org

1. Keep a copy of your current `config.js`. It contains the project URLs and public keys you have configured. Keep your existing `CNAME` too.
2. Replace the entire `portal` folder on your website with the `portal` folder from this package. The internal page is `portal/internal/index.html` and its new versioned entry point is `portal/portal.js?v=1.21`.
3. If uploading the full website package instead, preserve your configured `config.js` and your current `CNAME`. The package's example configuration does not contain your new Club project settings.
4. Publish your website normally. Open `https://www.pkuco.org/portal/internal/` and reload once with Ctrl+Shift+R (Windows) or Command+Shift+R (Mac).
5. Sign in using your real Orchestra account. The sidebar should be black and show Task, Notification, Contact, Settings, Booking and Game. The old heading “Files and notices from the administrator” should be gone.

The Site preview and your pkuco.org hosting are separate. Updating the Site preview does not upload these files to pkuco.org.

## Design and behavior

The page uses Times New Roman, a sidebar approximately 19 percent of the desktop viewport, a 66 pixel top tab strip, flat white content and thin table borders. The administrator's first task tab is Initiate new task. Members see New tasks, Outstanding tasks and Completed tasks. Declined tasks can be found using the filter under Completed tasks. Account administration and Club approvals are inside Settings so the main sidebar matches the drawing.

The recipient table has separate Mandatory and Optional checkboxes. Selecting one clears the other. It includes an Instrument column and group rows. Existing profiles without instrument/group/display ID metadata show a dash for instrument, an Orchestra group and a short UUID; no personal details are invented. The sample portal includes demonstration instrument/group values.

Background customization is under the compact Background color control at the upper right. Search uses the same folded left-edge control, keyword field sizing and colours as the Events page. The logo, navigation, score ornament and bottom footer use the existing website assets.

Booking and Game appear as disabled navigation labels because no functional specification for them was supplied. Task formatting applies to the whole body. The task toolbar includes bold, italic, underline, strike, font size, colour, highlight and attachment controls.

## Supabase setup correction

Continue using `SUPABASE_SETUP_v1.20.md` for backend setup. In its webhook step, the current Dashboard route is **Integrations → Database Webhooks → Webhooks → Create a new hook**. It is in the Club project. The command-line section is an optional alternative to deploying through the Dashboard.

## Verification

Local checks passed for JavaScript syntax, task date/image helpers, sample task and chat transitions, generated portal views and the independent page entry point. The managed browser preview service is unavailable in this environment; rendered browser appearance has not been visually verified here. Live Supabase, email and webhook testing remain necessary after setup.
