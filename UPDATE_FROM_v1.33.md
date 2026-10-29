# COPKU Website v1.34 — MuseScore attachment preview

Upload the complete contents of COPKU_Website_v1.34 to the main Orchestra website. This is the Orchestra release; the separate email website does not need an update.

In a task or notification, attach an MSCZ file within the existing 10 MB limit. Open its detail page and click **Preview** beside the attachment. Use the page arrows and zoom to read the score. Click **Play score** to prepare the audio once, then use the audio player's Play/Pause, seek and volume controls; playback speed is available beside it. The first preview loads the score engine and its sound set, so it may take longer on a slow connection. Audio generation starts only when Play is clicked. Closing the window stops playback and releases its Worker and generated files.

The renderer is a pinned MuseScore 4.6.5 engine. Older compatible MSCZ scores are supported; damaged, empty, unusually expanded, encrypted or newer unsupported formats show an error while the original download stays available. Playback uses standard instrument sounds and does not include external Muse Sounds, VST instruments or effects.

Scores are processed inside the member's browser after existing authenticated Storage access. No third-party score upload or conversion account is involved. No new Supabase SQL, bucket, secret or webhook is required. Member mailboxes, Stripe orders, bookings and account rules continue to use the existing backend.

The complete release must include `portal/score-preview/vendor/`: its engine, data, SoundFont, licences, notices and build files are required. This makes this release larger than v1.33. Do not omit the large `.wasm`, `.data` or `.sf3` files. See `portal/score-preview/licences.html` for the exact source/build pins and readable component code. If a host applies its own CSP, it must allow same-origin Workers and WASM (`script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'`), same-origin asset requests, and `blob:` media/images. Keep existing Supabase/CDN directives alongside those permissions.

In the private portal demo, the first rehearsal task and the administrator's rehearsal notification include the original **Portal playback exercise.mscz** example. Demo files and all sample accounts are separate from live Orchestra data.
