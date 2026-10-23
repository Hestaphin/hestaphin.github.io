# Homepage rebuild 16 October 2026

This version implements the supplied homepage image and WEBSITE DESIGN INSTRUCTION-homepage-v1.docx in the existing static website. The reference’s placeholder titles, dates, and introductory copy are retained.

## Corrections after screenshot review

The full name in the title bar now uses only solid black and white, switching at the boundary between the light and dark rectangles. The clef and accidentals use Bravura vector outlines and one shared staff coordinate system. Sharp and flat positions follow standard treble-clef key signatures. The notation is rotated as one complete unit, with all five lines aligned to the glyphs. The contact form is stacked above the decorative score, so no staff line crosses its white inputs, message area or button. Footer etanod/support entrances have been removed.

The background and key update on the visitor’s local hour, checked every 15 seconds and immediately when returning to the tab. Relative major/minor pairs share their written key signature. Colour transitions last two minutes. All pages use this same live background rule; content panels and Events cards follow the hourly palette as well.

Bravura glyph outlines are used under the SIL Open Font License; attribution and license are in `assets/BRAVURA-OFL.txt`.

## Normal zoom sizing

Desktop typography, title-bar height, navigation height, controls, and pixel spacing have been recalibrated to reproduce the approved 50% Chrome screenshots at normal 100% browser zoom. The image widths, background proportions, section widths, and column layout remain responsive. The title bar is capped at 48 CSS pixels, section navigation at 66, body copy at 19, headings at 31, and the hero title at 32. Mobile uses separate readable text sizes. Browser zoom remains under the visitor’s control. Use Chrome’s Reset zoom to view the updated default sizing.

The bar order is Home, Events, About, Learn, Opportunities, Contact, Shop across the website. Section order on the homepage remains Events, About, Learn, Opportunities, Contact.

## Deploy the downloadable website

Extract the ZIP and upload the contents of its `COPKU_Homepage_2026-10-16` folder to the root of the existing GitHub Pages repository. Keep `index.html`, `homepage.css`, `homepage.js`, `assets/`, and the existing page directories together. The original CNAME is retained. Use a web server or GitHub Pages; opening the file directly with `file://` does not support the website’s root-relative routes.

## Homepage behavior

- Fixed title bar with the original logo symbol, full name, 24 equal grayscale rectangles across the left 58%, and a black right-hand area. Login uses the existing session-aware Portal destination.
- Full-height violin opening with a clickable lower-right title. Transparent navigation sits at the bottom of the initial viewport.
- Scrolling 240 CSS pixels on desktop, or 200 on small screens, fades the opening through black and docks the white navigation below the title bar. Scrolling up reverses this. Mouse-wheel step sizes depend on the device and browser.
- Navigation follows the revised order: Home, Events, About, Learn, Opportunities, Contact, Shop. Section links stay on the homepage; Shop opens its existing page.
- Three event previews with the chamber concert initially centred. Drag, swipe, horizontal scroll, vertical mouse wheel, arrow keys, or the three sequence buttons to browse. Vertical scrolling continues normally at the carousel’s ends.
- Events, About, Learn, Opportunities and Contact follow the reference layout. Rectangular buttons, a blue full-width Learn image, a two-column contact form, dark footer, and red bottom strip replace the previous homepage styling.
- The right-hand five-line score has 77% transparency and continues from the event introduction through the footer. Its key signature changes every hour.
- Weekday navigation underline colours follow the DOCX. Weekend hover colours are randomly selected saturated hues with white underlines. The active-page underline turns black when the pointer and keyboard focus leave the link on weekends.
- The current hour and weekday use each visitor’s device clock. At an hour boundary, the content background blends to the next colour over two minutes. The first seven RGB values are exactly those supplied in the DOCX; the remaining values are light pastel colours. Reduced-motion preferences disable animated transitions.

## Hourly palette and key signatures

| Local hour | Key | RGB |
| --- | --- | --- |
| 00–01 | C major | 255, 255, 255 |
| 01–02 | A minor | 151, 153, 177 |
| 02–03 | G major | 170, 150, 177 |
| 03–04 | E minor | 151, 177, 176 |
| 04–05 | D major | 177, 158, 168 |
| 05–06 | B minor | 174, 177, 167 |
| 06–07 | A major | 177, 161, 150 |
| 07–08 | F♯ minor | 245, 240, 231 |
| 08–09 | E major | 248, 242, 224 |
| 09–10 | C♯ minor | 246, 244, 226 |
| 10–11 | B major | 240, 246, 232 |
| 11–12 | G♯ minor | 247, 249, 242 |
| 12–13 | F♯ major | 234, 247, 238 |
| 13–14 | D♯ minor | 231, 246, 243 |
| 14–15 | D♭ major | 231, 244, 249 |
| 15–16 | B♭ minor | 234, 239, 250 |
| 16–17 | A♭ major | 239, 235, 249 |
| 17–18 | F minor | 245, 234, 247 |
| 18–19 | E♭ major | 250, 234, 241 |
| 19–20 | C minor | 251, 237, 233 |
| 20–21 | B♭ major | 249, 240, 230 |
| 21–22 | G minor | 244, 240, 235 |
| 22–23 | F major | 238, 239, 247 |
| 23–24 | D minor | 247, 246, 250 |

## Assets and destinations

The violin and three event PNGs are the supplied originals. The harpsichord is the supplied event2 image and the flute player is the supplied event1 image; they are arranged in the order shown in the reference. The piano image was extracted from the reference because a separate piano original was not attached. The complete original `PUCO-LOGO.png` is preserved; the title bar uses a crop containing its symbol.

Each event has a specific detail page. Event date, booking, and programme information remain unannounced rather than being invented. The About image opens an Our work page. The learning links open specific sections of the Learn page. Apply opens an email application form; Register opens the existing membership registration/payment form. More details opens the separate orchestra or club detail page.

Membership remains available from the footer. The etanod/support entrance has been removed from every footer. The existing `/support/` route is retained for compatibility.

## Existing integrations

`app.js`, `config.js`, `style.css`, the full original logo and all `supabase/` files are byte-for-byte unchanged from the supplied ZIP. Existing sign-in, internal and member portals, payment functions and settings are retained. The contact form uses the original FormSubmit AJAX endpoint, field names and hidden settings. It keeps success and error feedback on the current page.

Homepage presentation and interaction code is separate in `homepage.css` and `homepage.js`. Other pages receive the shared fixed title bar; their existing content and account/payment interfaces remain in place.

## Verification

Passed local checks for 31 pages and 893 local asset/link references, including every fragment destination. All 31 navigation bars use the revised order. Twenty-three desktop sizing rules were checked at seven viewport widths against the former 50% Chrome scale; mobile body, input and footer text retain readable sizes. JavaScript syntax checks pass. Simulated DOM tests cover initial, intermediate, docked and reversed scrolling states; carousel centring, preview captions, indicators, keyboard/wheel behavior; 24 distinct hourly backgrounds; sharp and flat signatures; weekday and weekend behavior; and reduced-motion navigation. The corrected notation was inspected using Bravura glyphs rendered at the exact staff scale. Additional checks cover a live hour boundary, a relative major/minor pair, the sharp-to-flat transition, midnight rollover, title contrast of at least 4.5:1 on all 24 rectangles, and form/score stacking.

The unchanged application code was tested with mocked responses for successful and failed contact submissions, and Login/Portal destinations for logged-out, administrator, internal and membership sessions. No live email, login or payment was submitted. Browser-based visual QA was unavailable in this session, so pixel-level matching and device layout still require a browser review.

## Events page update

The Events page has been rebuilt from the separate 16 October instructions. Its image borders are removed, folding the search panel retains the reading position, From/To choose months only, and the year picker stops at the next calendar year. See `events/README_EVENTS_2026-10-17.md` for its normal view, search panel, filters, data and verification. The homepage itself retains the approved compact sizing and layout.

## About page update

The About overview, three project pages and Epic Piano activity follow the 17 October references. The sidebar is black and the activity area shares the homepage hourly colours and score. See `about/README_ABOUT_2026-10-17.md` for routes, filtering and verification. Events now retains its visible score behind transparent card text areas, and its unchecked order box means newest first; checking it selects oldest first.

## Learn page update

Learn follows the 18 October instructions, with four topic pages, the existing Schubert and major-key entries, shared search, and the blue image sidebar. See `learn/README_LEARN_2026-10-18.md`. Homepage learning links open the corresponding detail pages; the older Learn fragments are retained.

## Opportunities page update

Opportunities follows the 18 October references with the two supplied images, separate Details/Apply/Register destinations, both activity callouts and shared search. The image entrances disappear while results are shown. See `opportunities/README_OPPORTUNITIES_2026-10-19.md` for routes, partial calendar periods and verification.

The Opportunities entrances now start with an equal image reveal (club left, orchestra right). Dragging reveals the fixed image and text layers, with touch/keyboard controls and a double-click reset. Its activity cards use the shared Events sizing and text styles.
