COPKU v1.37 — UPDATE ONLY (base: v1.36)

1. Extract this ZIP.
2. Copy this folder's contents into your existing COMPLETE orchestra website
   folder. Keep matching paths, replace matching files, and keep other files.
3. Upload the resulting complete folder to your existing Netlify site.
   The small update ZIP alone is not a complete site.
4. Refresh the portal (Ctrl+Shift+R / Command+Shift+R if needed).

Supabase is already updated for you. No manual database or scheduler steps
are required. Included supabase files are source/reference copies only;
do not run the migration again on your current configured project.

Booking: administrators can pick today through six days later (Beijing time).
Select cells, then Recurring booking: every day or every N days.
New dates are booked automatically as they enter the rolling seven-day window.
Conflicts are shown without overwriting existing bookings or warnings.

Scores: Preview an MSCZ file. Playing notes highlight blue; click a note to
start there. Follow playback changes pages. Unsupported timing falls back to
the existing preview/audio player.

Read UPDATE_FROM_v1.36.md for the full behavior, limits and validation notes.
Keep all existing large MuseScore engine/SoundFont/font files. They are unchanged.
The separate email website is unchanged.
