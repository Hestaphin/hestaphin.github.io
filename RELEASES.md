# v1.21 — 22 October 2026

Portal layout corrected to follow the supplied drawings. The portal page now loads its own client and versioned assets without the legacy dashboard renderer or card stylesheet. No extra SQL is needed when upgrading from v1.20. Read UPDATE_FROM_v1.20.md before uploading.

# v1.20 — 22 October 2026

Orchestra tasks, notifications, approved chats and Club registration review. Start with SUPABASE_SETUP_v1.20.md. Live backend configuration is required. See VALIDATION_v1.20.md for checks and limitations.

# Website releases

## v1.19 — 20 October 2026 (Asia/Shanghai)

- Added free Membership Basic signup on the Club category. New members create an email/password account without paying; email confirmation returns to the Club portal. Existing signed-in Club members can enter their portal directly. Paid/expired members retain Basic portal access when paid benefits end.
- Kept the reference-style login chooser but split its systems: Orchestra uses its existing project/admin/internal profiles; Club uses a different project, its own client, profile table, passwords and session key. Wrong-system accounts are rejected, Club logout/password recovery cannot change Orchestra, and signed-in tabs expose the correct portal.
- Removed public membership checkout. Paid plan selection, upgrades/renewals, Stripe return status and new payment history are inside the authenticated Club portal. Success redirects alone never grant paid membership; background refresh preserves active form input.
- Added `supabase/club/` with the Basic signup trigger, owner-only reads/RLS, service-only transactional payment fulfillment, unique pending checkouts and duplicate-event protection. Both new Edge Functions are standalone files for pasting into the Supabase Dashboard. Original orchestra schema/functions are retained; no remote database migration or secret change was applied.
- Club credentials are intentionally blank until a separate project is configured; Club never falls back to Orchestra. English `supabase/club/SETUP.md` and updated `README_CN.md` give Dashboard-only setup, SMTP/redirect configuration, Stripe activation and existing-member migration steps. Current owner-only hosting access is retained.
- Checked actual frontend/TypeScript handlers with mocked Auth/Stripe, and the migration in embedded PostgreSQL: Basic signup, session/portal isolation, password recovery, server-bound price/identity, signed paid fulfillment, RLS/privileges, atomic/idempotent orders and renewal. Existing homepage, navigation, activity searches, contact and shop checks pass. Browser visual QA and live Supabase/email/payment testing remain unavailable. This release is `COPKU_Website_v1.19.zip`.

## v1.18 — 20 October 2026 (Asia/Shanghai)

- Replaced the login chooser with the supplied black-and-white popup: Orchestra/Club tabs, Username and Password fields, selected white tab, close control, and bottom Login / Not a member yet? actions. Header Login opens it over the current page; `/login/` opens it directly.
- Not a member yet? opens `/opportunities/`. The old Internal Login and Membership screens are removed; their URLs contain forwarding only, preserving old payment/activation query strings and fragments.
- Moved registration, checkout and password activation into the Opportunities Club category. Register links and new checkout returns use that view. Existing Supabase configuration, server functions, role checks and payment plans are retained.
- Added Events Ongoing/Past dropdowns on every current page and matched the Events sidebar label. Old Upcoming fragments continue to select the same category.
- Verified shared-client login, account-role rejection, loading/errors, focus/tab controls, checkout/activation returns, category visibility, navigation and existing contact/shop behavior with mocked requests. Browser visual testing and live authentication/payment testing were unavailable. This release is `COPKU_Website_v1.18.zip`.

## v1.17 — 20 October 2026 (Asia/Shanghai)

- Matched the Opportunities dropdown on every page to its sidebar: Orchestra, Wind band, Club, in that order.
- Replaced the old standalone Orchestra and Club layouts with the shared Opportunities hero/sidebar/activity layout at `/opportunities/orchestra/` and `/opportunities/club/`. Added the matching Wind band view at `/opportunities/wind-band/`. Each URL loads its own selected category directly, including a static fallback.
- The homepage More details buttons, Opportunities hero links and sidebar choices use these same paths. Category changes update the URL, page title and selected dropdown/sidebar entry; refresh and Back/Forward restore the view. Existing fragment bookmarks normalize to the new paths.
- The shared reveal images, category search/folding behavior, activity detail pages and Apply/Register destinations remain available. Checked all 34 pages, local links, category route loads and history. This release is `COPKU_Website_v1.17.zip`.

## v1.16 — 20 October 2026 (Asia/Shanghai)

- Added Events Upcoming/Past and Opportunities Orchestra/Wind band/Club category bars below their main images. Both load the existing About sidebar CSS for identical width, typography, spacing, selected rows and responsive layout. Activity cards keep the shared image/text format.
- The Opportunities hero images and “See more details” links select and scroll to their matching inline category. Orchestra and Club show their existing descriptions, Apply/Register destinations and activities; Wind band shows an empty state until records are added.
- Event categories compare supplied dates with the current Asia/Shanghai calendar day. Today and future dates, together with undated announcements, appear under Upcoming; earlier dates appear under Past. Dates and activities have not been fabricated.
- Searches remain within the selected category, folding search retains it, and category links support direct fragments and browser history. The sidebar title restores all activities.
- Checked category/date boundaries, scoped search, hero links, selection/focus state, history, reduced motion, pending-search cancellation and local references. This release is `COPKU_Website_v1.16.zip`.

## v1.15 — 20 October 2026 (Asia/Shanghai)

- Clicking a main navigation title closes any open submenu, including homepage titles that scroll within the same document. The menu stays closed while the clicked title retains focus.
- Hovering again, the separate disclosure buttons and keyboard arrow controls can still reopen submenus. Main-title destinations and homepage smooth scrolling remain available.
- Checked title activation, renewed hover, disclosure controls and focus/ARIA state against the shared navigation controller. This release is `COPKU_Website_v1.15.zip`.

## v1.14 — 20 October 2026 (Asia/Shanghai)

- White selection rectangles with black text apply to dropdown entries only. Main navigation titles use their original active underlines and weekday/weekend hover rules.
- Removed the fixed homepage navigation colors introduced in v1.13. The bar once again gradually gains a white background while its titles change from white to black as it moves upward during scrolling; scrolling back reverses the same transition.
- Kept translucent black dropdowns, their white text and selection rows, and the edge-free first and last rows.
- Compared the main-title CSS and scroll logic with the working pre-v1.13 revision and verified forward and reverse scroll states. This release is `COPKU_Website_v1.14.zip`.

## v1.13 — 20 October 2026 (Asia/Shanghai)

- Removed the white padding strip above and below dropdown items.
- While the violin image is visible, navigation and dropdowns use an 18% black background and white text. Hovered, keyboard-focused and current entries use a white rectangle with black text.
- Navigation returns to the existing content-page style after the violin image fades, and restores the image style when scrolling back up.
- Started numbered ZIP releases. The preceding website had 12 verified saved revisions; its ZIP filenames were unnumbered. This release is `COPKU_Website_v1.13.zip`.

## ZIP naming policy

`release.json` records the current release. Advance the minor number once for each new delivered website ZIP: the next release is v1.20, followed by v1.21. Keep earlier numbered ZIPs unchanged. Include the version in both the ZIP filename and its top-level folder. Generate the complete ZIP with `python3 tools/package_release.py`; it verifies all packaged bytes and refuses to overwrite a different release using an existing numbered filename.

Menu interactions, homepage scroll transitions, local links and retained integrations are checked. Visual browser testing was unavailable.
