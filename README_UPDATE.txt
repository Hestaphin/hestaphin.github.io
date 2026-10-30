# COPKU v1.40 — instrument classifications and booking filters

This update-only package is for the complete v1.39 orchestra website.

## Install the website update

1. Extract `COPKU_v1.40_Update_Only.zip`.
2. Merge the files inside its folder into your existing complete v1.39 website
   folder, replacing matching files and keeping the other files.
3. Deploy that merged complete folder to your current Netlify website.
   The patch alone is not a complete website.
4. Refresh the portal (Ctrl+Shift+R on Windows or Command+Shift+R on Mac).

The Supabase database upgrade and `portal-booking` function version 8 were
already applied to the connected orchestra project. No manual SQL or function
deployment is required. Backend source and the recorded migration are included
for version history; do not reapply an already recorded migration.

## Use the classifications

- Go to **Booking → Instrument**, open an instrument, then choose
  **Resource settings → Instrument classification** as administrator.
- Choose **Strings, Woodwind, Brasswind, Keyboard, Percussion, or Others**.
  The saved class appears in the booking table and the instrument's detail page.
- Open the **Instrument classification** filter above the table and tick one
  or several classes. The table shows instruments in any selected class.
  No selected classes means all instruments. **Clear filters** restores all.
- Existing instruments show **Not assigned** until an administrator assigns
  their class. A separate Not assigned checkbox helps find these instruments.
- Filtering happens before pagination. Counts and pages describe the filtered
  list; changing the filter returns to the first page. Selections stay in place
  during schedule refresh, date changes and returning from an instrument.
- Members can view/filter the classifications. Only administrators can edit
  resource settings. Both English and Chinese labels are included.

Room, Equipment and Transportation tables retain their existing columns.
Existing booking ownership, clearance, media, warning and recurring rules are
preserved. This update does not change the separate email website.

## Verification

New controller and backend tests passed for multi-class filtering, unassigned
resources, filtered pagination/counts, navigation/refresh, classification saves,
administrator permissions, invalid inputs and older client compatibility.
Existing booking/date/recurrence/media checks passed. Transactional checks in
the connected database passed for all six classes, persistence in snapshots,
stale-write rejection, restricted function grants and database constraints.
All test resource changes were rolled back. The security advisory set is
unchanged from before the upgrade.

Browser visual verification was unavailable because the managed preview service
was not running. Functional tests and the static build were checked separately.
