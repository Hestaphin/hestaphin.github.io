COPKU v1.49 — UPDATE FILES ONLY (for complete v1.46, v1.47 or v1.48)

Merge these files into your complete orchestra website folder, replacing matching
files and keeping everything else. Deploy the entire merged folder to Netlify.
Do not deploy this patch by itself. Hard-refresh with Ctrl+Shift+R or
Command+Shift+R after deployment; close and reopen existing score previews.

The current bar has a translucent pink background, independent of optional note
highlighting. Playback follows MuseScore repeat counts and first/second endings.
The seekbar uses written-score position and jumps backwards at repeats. Viewed
instrument and scroll position remain preserved across page turns.

New members must set their password AND verify an email with a six-digit code in
the same mandatory activation task. Password setup alone leaves the task open.
An administrator can still leave email empty at account creation. Existing pending
tasks were updated; already activated members are not required to activate again.

Supabase is already updated. No manual SQL, Edge Function deployment or new sender
configuration is needed. Existing Brevo settings send the verification codes.
Included backend files record the installed changes; do not rerun migrations.
Read UPDATE_FROM_v1.48.md for instructions, behavior and verification limits.
