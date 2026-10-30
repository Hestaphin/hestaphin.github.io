COPKU v1.43 — UPDATE FILES ONLY

Supports the complete v1.40, v1.41 or v1.42 orchestra website.

1. Extract this ZIP.
2. Open the COPKU_v1.43_Update_Only folder and copy its contents into your
   complete existing website folder. Replace matching files; keep other files.
3. Deploy the MERGED COMPLETE website folder to Netlify. Do not deploy only
   these update files.
4. Hard-refresh with Ctrl+Shift+R (Windows) or Command+Shift+R (Mac).

SUPABASE IS ALREADY UPDATED. No manual SQL or function setup is required.
The included backend source and migrations record the installed changes.
Do not rerun already-applied migrations. The separate email site is unchanged.

CURRENT WORKFLOW:
Booking -> resource -> select date/time -> Status: Booked or Warning ->
Repeat: Does not repeat / Every day / Every number of days -> Save booking.
For every four days, select Every number of days and enter 4.
06:00–08:00 = click 06:00, Shift-click 07:50 (120 minutes).
Warning replaces bookings. Both statuses share the same repeating scheduler.

Classification now applies to all four resource categories. Existing instrument
classifications are kept. All tables sort by the displayed ID, not the name.

Read UPDATE_FROM_v1.42.md for current instructions and classification options.
Older update guides in your original folder describe previous versions.

Functional and connected-database checks passed, with test fixtures rolled back.
Visual browser verification was unavailable because the preview service was down.
