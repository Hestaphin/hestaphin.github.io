# COPKU v1.37 update

This is an update-only package for the existing v1.36 orchestra website. It
contains the changed files and new small JavaScript modules. Keep the existing
MuseScore engine, fonts, SoundFont, images and other website files.

1. Extract `COPKU_v1.37_Update_Only.zip`.
2. Open the extracted `COPKU_v1.37_Update_Only` folder. Copy its contents into
   your existing complete website folder, keeping the same folder structure.
   Choose **Replace** for matching files. Keep all other existing files.
3. Deploy the resulting complete website folder to your existing orchestra
   Netlify site. The small update ZIP by itself is not a complete Netlify site.
4. Refresh the portal. If an old page remains visible, refresh once with the
   browser's cache bypass (Ctrl+Shift+R on Windows, Command+Shift+R on Mac).

The booking backend has already been configured in COPKU DATA. There is no
new Supabase, Stripe, Brevo or email setup for you to perform for this update.
The included `supabase` files are matching source/reference copies; do not
run the new SQL again on this already-configured project.

## Booking

Administrators have a compact date selector in Booking. The seven available
dates are today through six days later, inclusive, in Beijing time. Ordinary
members keep today's booking window.

Open a resource, choose the first date and select its ten-minute cells. Use
**Book** for a single booking or **Recurring booking** to repeat those exact
cells every day or every chosen number of days. Non-contiguous selections are
preserved. Recurring bookings are available only to administrators.

The system reserves matching dates within the rolling seven-day window and
checks for new dates every minute. Repeats continue until stopped. It never
overwrites another booking or a warning. A conflict on the first date rejects
creation; a later conflicting date is skipped and shown in the recurring list.
Skipped dates are not retried automatically.

**Cancel booking** releases selected cells on one date. The recurrence will
not silently restore them. The creator can use **Stop repeats** to stop the
series and release its future reservations from tomorrow onward. Today's
reservations remain and can be cancelled separately. Warning cells remain
protected. Only your own recurring series are shown in the recurring list.

## Score preview and playback

Click **Preview** beside an MSCZ attachment in a task or discussion. Once note
tracking is ready, the currently playing note heads turn blue. Click a note
to start playback at its position; use Tab and Enter for keyboard access.
Chords highlight together, and repeats, tempo changes and tied notes use the
score's actual playback timing. Clicking a repeated note uses its current or
next occurrence, returning to its first occurrence after the last repeat.

**Follow playback** turns pages as the music advances. Uncheck it to read
another page; using the page arrows during playback also turns it off. The
native audio controls still provide pause, seeking and speed adjustment.
Preparing the audio happens once per opened score, including when the first
action is clicking a note. Larger scores can take time to prepare.

The score stays in the browser. The note mapper runs separately from the
audio engine. If the mapper cannot validate a score's timing or geometry
(for example, unsupported grace-note timing), it explains that note tracking
is unavailable and keeps the ordinary preview, audio and original download.
Audio output latency varies by browser/device; a small fixed compensation is
used for the bundled MP3 encoder, without stretching timing over its audio tail.

## Applied backend and verification

- Migration `20261029181429_recurring_bookings_v137`.
- `portal-booking` Edge Function version 7, deployed and active. User tokens
  are verified inside the handler and admin roles are read from the database.
- Database schedule `copku-recurring-bookings`, once per minute; successful
  live runs confirmed. Existing task and application-email schedules retained.
- Transactional live database checks passed for date bounds, admin-only
  repeats, conflicts, cancellation, warning preservation and idempotency.
  Test data was rolled back.
- Controller and model checks passed, including task/discussion attachment
  integration, note clicking, fallback, cleanup and playback speed.
- Actual bundled MuseScore WASM checks passed for a 32-note exercise and a
  separate repeat/tempo/chord/tie fixture (13 note heads, 22 occurrences).
  Audio remained non-silent after the separate mapping worker was terminated.
- Browser visual QA could not be completed because the managed preview
  service is unavailable. The private hosted preview requires ChatGPT sign-in.

The separate email website is unchanged.
