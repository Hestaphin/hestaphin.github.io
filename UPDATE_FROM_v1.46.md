# COPKU v1.47 — current bar highlight

Copy these update files into your complete v1.46 orchestra website folder,
replacing matching files and retaining all other files. Deploy the complete
merged folder to Netlify, then hard-refresh with Ctrl+Shift+R (Windows) or
Command+Shift+R (Mac). Do not deploy this update-only folder by itself.

## Using the highlight

Open an MSCZ attachment in a task or notification with **Preview**, then play
the score. A translucent pink rectangle follows the current bar across all its
staves, like your reference. It stays visible through rests and moves at the
barline. A compressed multi-measure rest remains highlighted for the duration
of its printed group.

Current note highlights and clicking a note to play from there remain available.
Seeking in the audio player updates the bar, pausing keeps the current position,
and zoom scales the highlight together with the score. **Follow playback**
controls page following for both bar and note tracking.

The bar geometry is calculated from each score's engraved layout, so it applies
to supported MSCZ files generally. It uses the same timing as the existing audio
player. System-final bars end at the staff edge rather than the page margin.
The original score, audio engine, instrument sounds and downloads are unchanged.

## Setup and checks

No Supabase, Stripe or email configuration is required for this update.

Checks passed for full staff height, bar and system boundaries, rests, backward
seeking, repeated bar visits, compressed rests, page following, zoom, audio
export and attachment previews in both tasks and notifications. Actual pinned
MuseScore WebAssembly tests passed on the demo and two additional notation
fixtures, including a four-staff example. Existing note tracking tests passed.

The managed browser preview service was unavailable. Browser visual verification
was not completed; functional checks and native score geometry checks passed.
