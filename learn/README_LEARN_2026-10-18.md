# Learn page — 18 October 2026

Built from the supplied Learn DOCX and mockup. Learn uses the same title/navigation bars, search panel dimensions, filters, activity typography, footer and empty score as Events. The left Knowledge place column uses the left part of the supplied `event3.png`, darkened for white text. The right area follows the homepage’s live hourly palette and two-minute colour transitions. There is no opening image banner.

## Topics and entries

The four topic pages highlight their selected sidebar title with a white rectangle and black text. Hover and keyboard focus underline the topic using the homepage’s weekday colour. A topic page starts with its introduction and lists only entries in that topic:

- `/learn/fun-facts/`
- `/learn/music-theory/`
- `/learn/magazine/`
- `/learn/research-centre/`

The two existing learning entries are retained as working detail pages:

- `/learn/fun-facts/schuberts-wife/` retains the Schubert introduction and its existing learning-event link.
- `/learn/music-theory/major-keys/` retains the key-signature introduction and contact link for theory sessions.

No publication dates were supplied for these entries. Their titles occupy the first card line instead of a guessed date. All years is selected initially, so both can be found. Dated entries are sorted newest first by default, with undated entries last; checking “Order from oldest to newest” reverses dated entries. Undated entries have a stable order. Magazine and Research centre show an empty state until entries are added.

The homepage’s two learning links now open these detail pages. Existing `/learn/#schubert` and `/learn/#major-keys` fragments remain available on the overview. Search results do not duplicate these anchor IDs.

## Search and content

Learn shares the Events controller and filter styles. Keyword search includes the entries’ linked detail-page content. A topic page restricts search to that topic. Keyword, year, seasons and month range apply together. Year selection permits past years through next year, and From/To select only months. Undated entries are excluded when a year, season or month restriction is applied. Folding search preserves the reading position and returns to the normal view.

`learn-data.mjs` holds topics and entries. `learn.css` holds the Learn layout; shared card styling comes from `events/events.css`. HTML files include static content and working navigation. Keep static card content in sync when changing the records.

## Shared corrections

About activity cards now inherit Events’ text size, padding, paragraph spacing, row proportions and See detail styling. See detail stays at the lower right even when the card has no visible bottom-left label.

On weekends, active-page navigation underlines are black at rest and white during hover or keyboard focus. Weekday colours and weekend hover backgrounds retain their existing rules.

## Verification

Passed functional checks for overview and topic scope, keyword and detail-text search, empty topics, undated entries, search/fold states, unique legacy anchors and existing About/Events behavior. Hourly colours, key signatures, homepage interactions and existing contact/session behavior also pass. Navigation and all 27 pages and 769 local asset/link references were checked, including fragment destinations. Original account, contact, payment and Supabase code is unchanged. Browser visual QA was unavailable in this session.
