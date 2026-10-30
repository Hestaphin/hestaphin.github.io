# COPKU v1.42 — recurring bookings and warnings

Recurring bookings were already available. This update adds the missing
administrator-only recurring warning option, using the same time grid and
daily/custom-day interval controls.

## Install the update

This cumulative patch works over v1.40 or v1.41 and includes the v1.41 same-name
resource correction. Merge the files inside `COPKU_v1.42_Update_Only` into your
complete existing orchestra
website folder and replace matching files. Keep the remaining website files.
Redeploy the merged complete folder to Netlify, then refresh the portal with
Ctrl+Shift+R (Windows) or Command+Shift+R (Mac). The patch alone is not a full site.

The connected orchestra Supabase project is already updated. The recorded
`recurring_warnings_v142` migration and portal-booking function version 10 have
been applied. No manual SQL, scheduler or function setup is needed. Backend
source and the recorded migration are included for version history.

## Repeat 06:00–08:00 every day or every four days

1. Sign in as an administrator. Open **Booking**, choose the resource category,
   then click the resource name.
2. Choose the start date using **Booking date**. Administrators can choose today
   and the following six dates. Choose a future date if a booking's start time
   today has already passed.
3. Click the **06:00** cell, then hold **Shift** and click **07:50**. This selects
   exactly twelve 10-minute cells: **06:00–08:00**, or 120 minutes.
4. Click **Recurring booking** to reserve those cells, or **Recurring warning**
   to block them as warnings. The recurring action also applies to the start
   date you chose.
5. Select **Every day**, or choose **Every number of days** and enter **4**.
6. Click **Start recurring booking** or **Start recurring warning**.

Each repeat uses the same selected cells. The system fills a rolling seven-day
calendar automatically and continues as the calendar moves forward, until you
stop the series. An interval longer than seven days is still remembered and
applied when its next date enters that window. All booking dates use Beijing time.

## Conflicts, clearing and stopping

Recurring bookings preserve other users' bookings and warning periods; conflicts
are listed. Recurring warnings replace bookings in the selected cells on each
repeat date, just like the administrator's one-time warning action. Review this
before confirming. Clearing a warning does not restore a replaced booking.

On the resource detail page, **Your recurring bookings and warnings** lists the
type, interval, dates and current state. **Stop repeats** stops future scheduling
and releases this series' bookings/warnings from tomorrow onward. Today's cells
are kept. Later manual changes with different ownership remain in place.

For just one date, select the appropriate cells and click **Cancel booking** or
**Clear warning**. That date is not automatically reapplied by the series.
Members cannot create, clear or stop administrator warning series.

## Verification

Controller/backend tests passed for exact 06:00–08:00 selection, daily and four-day
intervals, warning replacement, idempotent retries, rolling calendar extension,
individual clearing, stopping, later manual changes and member restrictions.
Transactional checks in the connected database passed for these operations and
the existing recurring-booking behavior. Test changes were rolled back. The
existing rolling scheduler remains active; no extra scheduler job was added.

The login endpoint also returned its normal invalid-credential response for a
synthetic non-account probe after the earlier database incident. No password was
read or changed, and no full project restart was performed.
