# COPKU v1.46 — uniform controls, shared booking labels and clock colours

Merge the files in this update-only package into your complete v1.44 or v1.45
orchestra website folder, replacing matching files and retaining everything else.
Deploy the complete merged folder to Netlify, not the patch by itself. Then
hard-refresh with Ctrl+Shift+R (Windows) or Command+Shift+R (Mac).

All included HTML entrypoints are needed to update their references to the shared
time-colour files. This is a file-only patch; unchanged images and music engines
are excluded.

## Uniform application and uniform data

- Size options display size names only, such as S and M. Measurements remain in
  the full **Uniform data / 制服资料** page.
- Click a classification in your uniform table to open the full uniform data
  page and jump to its currently assigned/applied item. A classification without
  an assigned item jumps to its classification section. Type links and the
  application's Uniform data links also jump to the relevant item/section.
- The full catalogue remains on one page; this no longer opens a filtered page
  for just that classification. **My uniforms** returns with your draft intact.
- All application controls have a matching compact height.
- **Newly apply** has no reason field and needs no reason.
- **Exchange** has optional reason choices: No reason, Unfit size, Worn and Other.
  Only Other reveals a single-line text field. That text is optional too.
- New requests store the selected reason consistently. Old application records
  and retries from the previous website remain supported.

## Booking and sidebar

Every booking resource table now uses **Name**, including rooms. Rooms,
instruments, equipment and transportation continue to share one booking
controller and table template.

Enabled sidebar section titles now use the same dark-grey background and white
text on hover as Email. Keyboard focus receives the same feedback. The disabled
Game entry remains unavailable.

## Public page background fix

Previously, opening a page started its own CSS transition from the default white
background to the hourly colour over 120 seconds. A newly opened Contact page
could therefore show a different colour from About, even at the same time.

The colour is now calculated from the visitor's actual device clock. The same
24 hourly colours and two-minute blend are retained, but every page computes
the same point in that blend. Initial entry, focus, visibility changes and
back/forward restoration synchronize the colour without a refresh. Updates run
once per second. Navigation and other interface animations remain separate.

## Supabase already updated

The orchestra project already has migration
`20261031073441_uniform_optional_reasons_v146` and `portal-material` function
version 2. No manual SQL or Edge Function deployment is required. Included
backend files record the installed changes; do not rerun recorded migrations.

Uniform holdings, request history, group eligibility and approval decisions are
preserved. Backend checks still enforce member identity, valid types and sizes,
one pending line per classification and decision-only review tasks.

## Verification

Passed controller checks for compact size options, jump targets, full catalogue
navigation, multi-line draft preservation, reason choices and the existing
application/review/collection flow. Live database tests passed for blank new
reasons, optional exchange reasons, presets, Other details, legacy retries and
unchanged holdings after rejection; all fixtures were rolled back.

Clock tests passed for matching fresh/already-open pages during and after the
hour blend, focus updates and back/forward restoration. Theme asset references
were checked across 35 HTML entrypoints. Existing booking and personnel/chat
checks passed. Security advisors are unchanged.

The managed preview service was unavailable, so visual browser verification was
not completed. The separately edited reference screenshot illustrates the compact
size dropdown; it is not a browser capture of the deployed page.
