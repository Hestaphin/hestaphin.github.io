# COPKU v1.48 — optional email and score viewing position

Merge these update files into your complete v1.46 or v1.47 orchestra website
folder, replacing matching files and keeping everything else. Deploy the entire
merged folder to Netlify, then hard-refresh with Ctrl+Shift+R (Windows) or
Command+Shift+R (Mac). Do not deploy this patch alone.

## Creating a member without email

In Settings → Accounts, an administrator may leave **Email (optional)** empty.
Username, name, temporary password and the required personnel fields still need
to be filled in. The member signs in with their username and temporary password,
then uses the existing urgent mandatory task to set their own password and
activate the account. This activation still does not require admin approval.

Email stays blank in the member directory and personal information. Multiple
members may have no email, and their usernames must remain unique. Administrators
can still edit their personnel fields or change their username.

An administrator can add the first contact email later by clicking the member's
Email value in Accounts. It takes effect without member verification, as before.
An account without email uses username login and cannot receive recovery email
until an address is added. Its Settings page explains this. A public password
help request creates an administrator assistance notice rather than attempting
to mail a missing address. Existing accounts keep their current email and the
normal verified flow when members change their own email. This update does not
remove existing contact addresses.

## Score preview page turns

During playback, scroll to the instrument you want to read. When the score
changes page, the viewer keeps that staff at the same screen height, including
when the new page has different staff spacing. The same applies to manual
forward/backward page turns. Horizontal position is also retained.

The viewer waits for the new image layout and staff map before applying the
precise position. If you scroll or drag during loading, your action takes
priority over a late response. If an instrument is hidden or cannot be identified
on that page, the viewer keeps the relative vertical position instead of
returning to the top. Positions are clamped for shorter pages.

Current bar and note highlights, click-to-play, playback speed and zoom remain
available. The v1.47 pink bar highlight is included in this patch for v1.46 users.
No new control needs to be enabled; use the existing Follow playback option.

## Supabase is already updated

Migration `20261031135732_optional_member_email_v148` is installed in the orchestra
project. The deployed functions are:

- `create-internal-user` version 20
- `portal-login` version 7
- `portal-account` version 8
- `portal-password-help` version 11

No manual Supabase steps are required. The included backend sources and migration
record the installed changes; do not rerun the recorded migration.

The existing unique-email rule remains for supplied addresses. Blank email is
allowed only for internal members with a username. RLS, admin-only creation,
login attempt limits, identity matching and activation task protections remain
in effect. The separate email website, Stripe and booking system are unchanged.

## Verification

Passed account handler checks for blank email creation, distinct login identities,
real email validation, permissions, cleanup on failure, personnel editing,
adding the first email and recovery fallback. Login checks passed for username
accounts, identity lookup, wrong-user rejection, bounded timeouts and private
error responses. Live database checks passed for multiple NULL emails, username
requirements, blocked direct member email edits, activation completion and Auth
email synchronization. Test records were rolled back. Security advisors are
unchanged.

Score checks passed for instrument identity, changed page spacing, zoom,
page/system selection, hidden-staff fallback, delayed image/map responses,
manual backward turns and user scroll priority. Actual pinned MuseScore WASM
checks passed on the demo and two additional notation fixtures, preserving
note tracking, bar geometry and audible audio export.

The managed preview service was unavailable, so browser visual verification
was not completed. Functional and native score checks passed.
