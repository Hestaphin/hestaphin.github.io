# About page — 17 October 2026

Built from the supplied About DOCX and mockup. The supplied Epic Piano image is copied unchanged to `assets/epic-piano.png`.

Following the 18 October screenshot review, activity cards inherit Events’ text sizes, padding, paragraph spacing and row proportions. See detail uses the same font and lower-right placement, including cards without a visible bottom-left label.

## Layout and routes

`/about/` opens with the Epic Piano image and the reference text: “Project Epic Piano is about to start / See more details”. Below it, a black Things we do column sits beside the hourly-colour activity area. On desktop the black column and the fully extended search panel use the same width. The page background is black; the activity area uses the exact homepage palette, local clock and two-minute transitions. The shared empty staff, live clef/key signature, footer and bottom red bar are included.

The three project links underline on hover and keyboard focus using the homepage weekday accent. The selected project is a white rectangle with black text. Each project page omits the opening banner, introduces its work, and lists only its own activities, newest first:

- `/about/piano-museum/`
- `/about/teaching-in-schools/`
- `/about/engaging-the-society/`

`/about/piano-museum/epic-piano/` is the detail destination for the banner and Epic Piano card. Its 18 October 2026 date and activity copy are taken from the mockup. The other two projects have no supplied activities and show an empty state. Their short introductions expand the orchestra’s existing teaching and community descriptions. No activity dates or completed projects were invented.

The existing `/about/our-work/` link from the homepage remains usable and displays the About overview.

## Search and content

About and Events share the search controller, form markup and filter styling. About searches activity records and their actual linked detail-page text. A project page restricts search to its own project. Keyword, year, season and inclusive month filters apply together; From/To select months only, and the year maximum is the visitor’s current year plus one. Folding returns to the normal view and retains the reading position.

The order control always reads “Order from oldest to newest”. It is unchecked initially, displaying newest first; checking it reverses the order. The control sits farther left, clear of the staff.

`about-data.mjs` holds project introductions and activity records. `about.css` holds the About layout. Each HTML page includes a static fallback with working navigation and details when JavaScript is unavailable. When adding activities, update the records and the corresponding fallback HTML together.

## Verification

Functional module checks passed for overview and project-scoped records, keyword/year/season/month combinations, date grouping, the 2027 year limit in 2026, open/search/fold states, empty projects and detail-page search. Events order tests verify both checkbox states and the fixed label. Shared clock, header, homepage and existing contact/session checks pass.

All 21 local pages and 572 local asset/link references were checked, including fragments and project/detail destinations. The supplied piano image is unchanged. Original account, contact, payment and Supabase code remains unchanged. Contact/session tests use mocked responses; no live message, login or payment was submitted. Browser visual QA was unavailable in this session.
