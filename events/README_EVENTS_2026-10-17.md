# Events page 17 October 2026

This page follows Event page instruction v1 2026 Oct-16.docx and its two supplied screenshots. It retains the approved normal-zoom title bar, the Home / Events / About / Learn / Opportunities / Contact / Shop navigation order, hourly background and key signature, and the homepage footer. The homepage layout and account, contact and payment integrations remain in place.

## Normal view and search panel

The normal view opens with the flute image and the reference’s five-line featured-event text, followed by image-and-description event cards. Cards have no border around the images. Their transparent text areas reveal the homepage’s hourly background and the empty score behind them. The clef and live key signature begin below the banner in normal view and at the top of the results in search mode. The background uses the homepage’s two-minute colour transition. The black Search tab stays at the top-left below the two fixed bars, regardless of page scrolling. Its hover colours invert.

Opening the panel keeps the normal page visible until Search is submitted. The panel stays fixed, with a smooth black-to-white vertical gradient. The left-pointing triangle is centred vertically on its fixed right edge. Click it, or press Escape outside the year editor, to close the panel and return to normal view while preserving the reading position. When closing search results, the same visible event is kept at the same vertical position in the normal list where the document’s scroll limits allow it. Closing also cancels a pending search, so a late network response cannot restore the results view.

The selected year is white and wider, on a dark-grey highlight fading out at both sides. Use the mouse wheel, arrow keys, or adjacent year buttons to change the year. Click the selected year to type a number; Enter commits the year and Escape cancels editing. Past years through the next calendar year are available, using the visitor’s device clock. In 2026 the maximum is 2027; 2028 is hidden and unavailable through buttons, wheel, keyboard or typed entry. All years clears the year restriction. Seasons are independent toggle buttons; none selected means every season. From and To are month-only dropdowns with Jan–Dec and an optional empty Month choice. They never display or select a year.

On small screens the fixed filter panel sits across the top of the content, leaving a separate visible area for scrolling the event list. Event cards stack on narrow phones. Reduced-motion preferences remove sliding transitions.

## Search rules

Search or Enter in the keyword field applies all current filters together. Changing a field alone does not replace the normal view or the previously submitted results.

- Keyword terms match the event title, visible description and featured text, venue, displayed date and actual detail-page content. Matching ignores case, repeated spaces, accents and straight/curly apostrophe differences. Every entered term must match.
- Year, keyword, selected seasons and inclusive From/To month boundaries are combined with AND.
- The month range applies within the separately selected year. With All years selected, it applies to those months in every year. An empty boundary leaves that side unrestricted.
- Multiple seasons are combined with OR. Spring is March–May, summer June–August, autumn September–November, and winter December–February, within the chosen calendar year.
- An empty keyword matches all events allowed by the other filters. An empty year with no seasons or month range includes undated events.
- Search results are counted and grouped by year and month. The checkbox is labelled “Order from oldest to newest” and starts unchecked, displaying newest first. Checking it switches to oldest first, including month-group order. The label stays unchanged. The control is placed farther left, clear of the score. Undated events stay last.
- From later than To produces an inline error without applying the invalid search.

The year initially selects 2025 because that is the latest dated year in the supplied reference. There are two dated 2025 entries and one existing undated harpsichord entry. Searching all of 2025 therefore shows two results; All years with no other restrictions shows three. The count reflects the supplied data. No date was invented for the harpsichord.

## Category sidebar — added in v1.16

Below the featured image, the Events sidebar loads the same `about/about.css` layout used by About: the same desktop width, black background, white headings, spacing, sticky position and responsive arrangement. Ongoing and Past filter the activity cards; the Events heading restores all events. Selected category rows use the existing white rectangle and black text.

Past includes dates before the current Asia/Shanghai calendar day. Ongoing includes today, later dates and announcements whose dates are still to be supplied. Searches combine the chosen category with the existing keyword/year/season/month filters. Folding search retains the category. As of v1.18, Events also has matching dropdown links at `/events/#ongoing-events` and `/events/#past-events`; the former Upcoming fragment is still supported. Browser history restores the selection. The initial all-events view and its supplied dates remain available.

## Content files

`events-data.mjs` contains the event records and supplied placeholder copy. Update it to add events, dates, images and existing detail-page URLs. `events-model.mjs` contains filtering, sorting, month grouping and view-state logic. `events.js` handles the controls and presentation for Events, About, Learn and Opportunities, choosing the appropriate records and project scope. `events.css` contains the shared archive and filter styling. The main `index.html` includes a static normal-view fallback. The running page refreshes its cards from the records.

At page load, the three linked event detail pages are fetched from the same website and their main content is added to the keyword index. Header, footer, navigation, forms and script text are excluded. If a detail page cannot be fetched, its title and visible excerpt remain searchable.

The dated entries and placeholder descriptions follow the design files. Existing event detail routes are preserved. Their full programme information can be developed separately without changing the search controls.

## Verification

Passed model and UI-module checks for combined filters, all month and season boundaries, detail-page indexing, case and apostrophe matching, year editing and wheel selection, the next-year maximum through every input path, next-year rollover, multiple season toggles, explicit search submission, accurate counts, both sort directions, month grouping, an invalid range, undated events, normal-view scroll retention, event anchoring when leaving results, reopening in normal mode, and closing during a pending search. The Events page and other shared-header pages also passed the shared hourly colour and key-signature rollover checks.

Local page/asset/fragment checks and existing homepage, contact and session-destination checks pass. Contact and account tests use mocked responses. No live message, login or payment was submitted. Browser-based visual QA remains unavailable in this session.
