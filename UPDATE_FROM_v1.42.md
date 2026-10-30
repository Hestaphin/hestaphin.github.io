# COPKU v1.43 — unified booking status and resource classification

This update-only package supports a complete v1.40, v1.41 or v1.42 website. It
includes the same-name resource correction and the latest scheduling changes.

## Install

Merge the files inside `COPKU_v1.43_Update_Only` into your existing complete
orchestra website folder, replacing matching files and keeping everything else.
Deploy the merged complete folder to Netlify. Do not deploy this patch alone.
Refresh with Ctrl+Shift+R (Windows) or Command+Shift+R (Mac).

The connected orchestra Supabase project is already updated: migration
`20261030165648_resource_classification_status_v143` and `portal-booking` function
version 11 are active. No manual Supabase configuration or SQL is needed. The
backend files in this patch are records of the installed changes; do not rerun
already-applied migrations. The separate email website is unchanged.

## Book or warn using the same form

1. Sign in as an administrator. Open **Booking**, choose the resource category,
   and click the resource name.
2. Choose a **Booking date** within today and the following six days.
3. Select time cells. For **06:00–08:00**, click **06:00**, then Shift-click
   **07:50**. The selection must show **120 minutes**.
4. In the shared form, choose **Status → Booked** or **Status → Warning**.
5. Choose **Repeat → Does not repeat**, **Every day**, or **Every number of
   days**. For every four days, enter **4** under **Interval in days**.
6. Click **Save booking**. Check and confirm the summary when shown.

There is one form, one repeating schedule list, one schedule table and one
existing rolling scheduler for both statuses. There is no separate recurring
warning button. Existing bookings, warnings and repeating schedules are retained.

**Booked** respects existing reservations and warnings. **Warning** replaces
bookings in the selected cells on each applicable date; nobody can book those
warning cells. Clearing a warning does not restore a booking it replaced.

The scheduler keeps filling the rolling seven-day calendar until **Stop
repeats** is selected in **Your repeating schedules**. Stopping releases the
series' future cells from tomorrow onward and retains today's cells. Later
manual overrides are preserved. For one date, use **Cancel booking** or **Clear
warning**; cleared dates are not automatically reapplied.

Regular members can make one-time bookings for today. Only administrators can
choose Warning, create repeats or clear warnings. All dates use Beijing time.

## Classification for every resource category

The column and filter are now called **Classification** everywhere in Booking.
Choose it in **Resource settings**, and use the compact multi-select filter
above the table. Multiple checked classifications are alternatives; no selected
classification means all. Filtering happens before pagination.

| Resource | Classification options |
| --- | --- |
| Instrument | Strings; Plucked string; Woodwind; Brasswind; Keyboard; Percussion; Others |
| Room | Storage; Practice; Other |
| Equipment | Trolley; Manual tools; Electrical tools; Environment control; Other |
| Transportation | Vehicle; Electric-assist; Other |

Existing instrument classifications carry over. Existing unclassified resources
show **Not assigned** until an administrator chooses their classification. No
classifications are guessed from names. Images, files, clearance and resource
identity are preserved. Same-name resources remain allowed, with unique IDs.

All four resource tables now sort by their displayed **ID**, with natural numeric
ordering (for example R2 before R10), before filters and pagination. Names do not
determine the order.

## Verification

Backend/controller checks passed for both statuses in the shared form, daily and
four-day schedules, one-time actions, warning replacement, clearing, stopping,
retries, member restrictions, all classification options, filtering, settings
and ID ordering across pages. Connected-database transactional checks passed;
all fixtures were rolled back. Old deployed clients remain compatible, and the
security advisory set is unchanged.

The managed local browser preview service was unavailable, so visual browser
verification could not be completed. Functional tests and native deployment
checks were used. The private Sites review copy is separate from the official
Netlify site; deploy the merged website folder to update that site.
