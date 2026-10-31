# COPKU v1.49 — update files only

This cumulative patch works with a complete v1.46, v1.47 or v1.48 orchestra website. The separate email website is unchanged.

## Install on Netlify

1. Keep your complete existing website folder as a backup.
2. Unzip `COPKU_v1.49_Update_Only.zip`. Copy the contents of its inner folder into your complete website folder, replacing matching files and keeping the other files.
3. Deploy the entire merged website folder to Netlify. This ZIP contains only updates and cannot be deployed by itself.
4. Hard-refresh the site with Ctrl+Shift+R (Windows) or Command+Shift+R (Mac). Close and reopen any score preview that was already open.

## Score playback

- The current bar has a translucent pink background across the score's staves. The bar timeline and geometry now come directly from the original score worker, independently of optional note highlighting. The overlay is positioned directly in the page, with a versioned stylesheet, to avoid the previous missing background.
- Playback follows MuseScore's native repeat itinerary, including repeat counts and first/second endings. It seeks the existing audio back at a repeat and skips the first ending on the second pass when the score specifies that ending.
- The audio seekbar represents the written score. Its position jumps backwards at a repeat; it does not show the total elapsed time including all repeated sections. The exported MP3 remains the written-score track; the player applies the repeat itinerary during playback.
- The viewed instrument and vertical position remain preserved when following playback to another page, including backwards page turns.

## First-login activation: password AND verified email

An administrator may still leave Email empty when creating a member account. Give the member their username and temporary password. Their existing urgent mandatory activation task now requires both steps:

1. Sign in and open the activation task on the personal page (or Settings).
2. Enter and confirm a new password, then click **Save password**. The task remains open.
3. Enter the email address the member wants to use, then click **Send verification code**.
4. Enter the six-digit code from that email and click **Verify email**. Both completed steps finish the same activation task automatically, without administrator approval.

Codes expire after 10 minutes. Wait one minute between requests. A code permits six attempts; at most five requests can be made in an hour. The member can request a replacement code if necessary. The verification step also applies when an administrator supplied an email at account creation. Setting an address as an administrator does not count as the member's verification.

Existing pending activation tasks keep their IDs and have been updated to describe both steps. Already activated members are not required to activate again. Ordinary email changes by activated members continue to use the existing Supabase verification-link process.

## Supabase and Brevo

The orchestra Supabase project has already been updated. **No manual SQL, new sender setup or Edge Function deployment is needed for this release.** Verification codes use the existing Brevo API key and application sender configured in Supabase, outside the admin portal.

Installed backend changes are included as source records:

- Migration `20261031144854_verified_activation_v149` adds private verification state and requires password setup plus verified email before completing activation.
- Edge Function `portal-onboarding`, version 1, authenticates the current member, sends the verification code through Brevo, validates it and confirms the email in Supabase Auth.
- The cumulative ZIP also includes the v1.48 optional-email backend records, which were already installed.

Do not rerun these installed migrations or upload the backend source files through the Supabase dashboard just to install this website patch.

## Verification

Checks passed for native MuseScore bar geometry across a 12-page, 154-bar band score; a native first/second-ending fixture; audio rewind and ending selection; pink overlay rendering logic even when note mapping fails; and instrument/scroll preservation. Live Supabase checks confirmed that password setup alone cannot complete activation, code expiry/attempt limits are enforced, and both password/email completion orders finish the task. Database test fixtures were rolled back.

Actual email delivery was not exercised by the checks. Browser visual verification was unavailable in this environment; native score, UI logic, backend checks and build validation were used.
