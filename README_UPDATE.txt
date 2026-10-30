COPKU v1.39 — UPDATE ONLY (base v1.38)

This is a general score-player correction. It uses no piece/filename rules.
It fixes large-score preparation, grace-note handling, delayed principal
notes, after-graces, tremolos, multi-measure rests, MIDI staff/port separation
and synchronization with the generated audio's actual single-pass order.

1. Extract this ZIP.
2. Copy its contents into your existing COMPLETE orchestra website folder.
   Keep the paths, replace matching files and keep all other existing files.
3. Deploy the resulting complete folder to your existing Netlify website.
   This small update ZIP alone is not a complete website.
4. Refresh with Ctrl+Shift+R (Windows) / Command+Shift+R (Mac) if needed.
   Close an already-open score window and reopen Preview.

No Supabase, Stripe, Brevo or email changes are required. Keep the existing
large MuseScore engine, fonts and SoundFont. No new engine binaries are needed.
The separate email system is unchanged.

The supplied score passed all 12 pages / 6,414 rendered-notehead seek targets.
Independent notation fixtures passed too. Zero-duration native grace notes
are clickable at their associated beat; they do not disable other highlights.

Read UPDATE_FROM_v1.38.md for the behavior, verification and supported-format
limits. Corrupt files and formats beyond the bundled engine are not guaranteed.
