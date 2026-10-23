# Opportunities page — 19 October 2026

Built from the supplied 18 October DOCX, Opportunities mockup and two images. The orchestra spotlight and chamber-stage images are copied unchanged to `assets/opportunity-orchestra.png` and `assets/opportunity-club-double-bass.png`.

## Layout and routes

`/opportunities/` begins with a 50/50 image reveal: club on the left and orchestra on the right, as in the revised mockup. Drag the central bar right to reveal more of the club image and its text, or left for the orchestra. Both layers keep their full-width size while only the visible boundary moves. Each has its own Details and Apply/Register links. The image reveal remains available on narrow screens.

Arrow keys move the divider, Shift+Arrow moves faster, Home/End fully reveal one image, and double-click restores 50/50. Touch and pen dragging are supported. Fully hidden links are excluded from keyboard navigation, and focusing partially clipped text reveals enough of its side to read it. The chosen boundary remains in place when search is opened and folded.

The three introduction lines and two activity callouts follow the supplied copy. Activities inherit Events’ 40% image column, row height, regular text sizes, paragraph spacing and lower-right detail styling. The previous oversized activity typography and separate row-height rules have been removed.

- Orchestra category: `/opportunities/orchestra/`
- Wind band category: `/opportunities/wind-band/`
- Club category: `/opportunities/club/`
- Apply: the existing `/opportunities/orchestra/apply/` form
- Register: `/opportunities/club/#club-registration-form`
- Club ticket activity: `/opportunities/club/ticket-discounts/`
- Violin class: `/opportunities/orchestra/violin-masterclass/`

The main page initially includes both activities. Category routes use the same image reveal, sidebar and activity area, with their own category selected. They replace the earlier standalone Orchestra and Club pages. Activity detail pages include a working Apply/Register destination and Contact link. Homepage More details links open the corresponding category routes. Older category fragments normalize to the matching route without adding a redundant browser-history entry.

## Category sidebar — added in v1.16

Below the image reveal, the sidebar uses the existing About stylesheet and layout, with Orchestra, Wind band and Club choices. Its dimensions, typography, spacing, sticky behavior, responsive arrangement and selected white row match About. Activity cards retain the shared Events/About image and text format. The Opportunities heading restores all activities and the original three introduction lines.

Clicking “See more details” or the corresponding hero image now selects and scrolls to that inline category. Orchestra and Club display their existing descriptions, Apply/Register destinations and relevant activities. Wind band has no supplied records and shows an empty message. New records with `project: 'wind-band'` automatically appear there.

Search uses only the selected category, and folding retains that category. As of v1.17, direct links are `/opportunities/orchestra/`, `/opportunities/wind-band/` and `/opportunities/club/`. Refresh and browser Back/Forward restore the selected category. The dropdown on every page uses the sidebar's exact Orchestra / Wind band / Club labels and destinations. The homepage More details buttons and hero links use the same URLs.

`opportunities-routes.mjs` defines the shared category labels, paths and legacy-fragment resolution. Each category also has a complete static document with the shared Opportunities layout and a filtered activity fallback; the previous standalone layout is gone. Existing application and activity-detail subroutes remain available.

The navigation, local-hour background, empty score and live key signature, footer and red bottom bar follow the existing site. The score begins below the two image entrances in normal view and at the top of search results. Application, membership, payment and account code are preserved.

## Search and calendar periods

The Events search panel is shared: same dimensions, gradient, year controls, seasons, month-only From/To fields and explicit Search submission. Opening the panel keeps both entrances visible. Submitting a search hides the normal view, including the entrances and introduction, and shows the matching activities. Folding restores the normal view and retains the visible activity’s reading position. Closing also cancels pending searches.

The supplied activities say “From July 5 to August 24” and “Spring Season”, without specifying a year. Those labels are retained and no year is invented. All years is selected initially. Month and season filters match the known July/August or spring period; choosing a specific year excludes activities whose year is unknown. Year selection stops at the current year plus one, so in 2026 the maximum is 2027.

As of v1.19, the Club category has free Membership Basic registration. Paid plan selection and checkout are inside the Club portal, using the separate Club Supabase project. See `../supabase/club/SETUP.md` before enabling registration or upgrades. The prior Membership page is forwarding-only; old-project activation links must be reissued from the new Club project. Header Login opens the Orchestra/Club chooser; Not a member yet? returns to Opportunities.

The unchecked “Order from oldest to newest” box uses descending calendar-period order. Checking it reverses the order. Full dates sort by their dates; yearless periods follow their known month, and fully undated records stay last. Keyword search includes activity metadata and the main text of the linked activity detail pages.

`opportunities-data.mjs` holds the entrances and activity records. Optional `dateLabel`, `months`, `seasons` and `detailLabel` fields preserve partial calendar information and the supplied button wording. `opportunities.css` holds the page layout and image clipping; `opportunities.js` handles the divider. HTML includes a static 50/50 fallback with working links; keep it in sync when editing the records.

## Verification

Passed shared model and UI-module checks for both groups, detail-text indexing, known month/season filters, year restrictions, both order directions, hiding the entrances in results, reading-position restoration and scoped detail-page searches. Existing Events, About, Learn, homepage, hourly palette, contact feedback and session-link checks pass. Account and contact tests use mocked responses; no live message, login or payment was submitted.

Simulated pointer tests also passed for the 50/50 initial state, both drag directions, 0/100 bounds, pointer capture/release/cancellation, mouse/touch/pen input, resizing, keyboard shortcuts, double-click reset, accessible percentages, hidden-side navigation and focus visibility.

All 31 pages and 893 local asset/link references were checked, including fragments and Apply/Register destinations. Both image files match the supplied bytes. The existing application form, membership page and original application/Supabase/payment code remain unchanged. Browser visual QA was unavailable in this session.

Updated 20 October 2026 (Asia/Shanghai): the club image is the supplied `Empty Chamber Hall with Double Bass(1).png`, copied unchanged as `assets/opportunity-club-double-bass.png` throughout the overview, club page, activity page and search data. Its dimensions remain 1672 × 941, and the 50/50 draggable reveal behavior is retained.
