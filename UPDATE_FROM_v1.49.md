# COPKU v1.50 — faster score page turns

This ZIP contains only the files changed since v1.49. Apply it to your complete v1.49 orchestra website folder. The separate email website is unchanged.

## Install

1. Keep a backup of your complete v1.49 website folder.
2. Unzip `COPKU_v1.50_Update_Only.zip` and copy the contents of its inner folder into the complete website folder, replacing matching files.
3. Deploy the entire merged folder to Netlify. This small patch cannot be deployed on its own.
4. Hard-refresh with Ctrl+Shift+R (Windows) or Command+Shift+R (Mac), then close and reopen the score preview.

No Supabase, Brevo or Stripe changes are needed for this update.

## What changed

The previous player first requested an unseen page when the music had already reached its first bar. This put native SVG rendering, geometry extraction and browser image loading after the page boundary. A native check on a 12-page band score measured about 220–400 ms to render and extract a page's geometry, before browser decoding. The instrument-position calculations themselves averaged under 0.01 ms in that check. These are measurements from this environment, not browser timing guarantees.

The player now renders and decodes upcoming pages in the background. At the page boundary, a ready page replaces the current image synchronously, with its staff geometry already available. The next two distinct pages in the playback itinerary are prepared ahead, including backward repeats and first/second-ending skips. It also prepares nearby pages for manual navigation.

The first upcoming page is prepared before initial audio playback begins. This may add a short wait before starting, when necessary, so that the first automatic turn has its page ready. Warming later pages does not pause the playing music.

The page buffer holds at most six prepared pages. Current and upcoming pages are protected from eviction; older pages and their image URLs are released. A distant repeat destination is regenerated before the repeat reaches it. Closing the preview releases pages and stops background preparation.

Your viewed instrument and vertical/horizontal position remain preserved. Position restoration happens with the prepared page rather than waiting for optional note mapping. Browser scroll anchoring is disabled within the score viewport to prevent it from fighting the saved position. Pink bar tracking, note highlights, note-click seeking, speed, zoom and repeat playback are retained. Upcoming note geometry is also prepared in the background when available.

An unexpected jump to an unprepared page, or a device under heavy memory/CPU pressure, can still need loading. This update removes the ordinary render/decode wait at prepared automatic turns; it does not claim zero rendering time on every device.

## Verification

Checks simulated slow page rendering and image decoding, verified that decoding happens before display, and confirmed a page swap within the same playback-boundary event. They also exercised a repeat return after the destination had been evicted from the six-page buffer, same-frame instrument-position restoration, missing optional note mapping, request deduplication and close cleanup. Existing score preview, attachment access, repeats, pink bar and viewport regression checks passed.

Native timing was measured on the existing 12-page, 154-bar band score without modifying or bundling that score. The managed browser preview service was unavailable, so visual browser timing remains unverified.
