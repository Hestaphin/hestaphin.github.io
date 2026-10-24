# COPKU v1.24 update

Your connected **COPKU DATA** Supabase project has already received the v1.24 database and account-function updates. No manual Supabase or Stripe setup is needed for this release. Publish the website files below.

## Publish the website

1. Extract `COPKU_Website_v1.24.zip` and upload the **contents** of its `COPKU_Website_v1.24` folder to the existing website repository.
2. Keep your configured `config.js` and `CNAME` if customized. The supplied configuration still matches COPKU DATA and COPKU Club.
3. Publish with the usual GitHub Pages process. Hard refresh once with Ctrl+Shift+R on Windows or Command+Shift+R on Mac.

This update changes the shared login code as well as the portal. Upload the complete package so every page loads the new version of the login scripts. The original pages and images remain included. The existing live textbook shop and Club membership payment functions are preserved.

## Personal page and personnel records

The Orchestra portal opens on **Personal page**. Clicking your name in the black sidebar returns there. It displays your name, username, email, department, occupation type, instrument, classification, rank and status. Members cannot edit personnel details there.

An administrator uses **Settings → Accounts** to create and edit records. The members table displays every personnel field. Click Edit to change any field; occupation and instrument choices depend on the department/occupation, and rank choices depend on classification. Changing a parent field clears an incompatible selection.

Existing records retain their names, email addresses and access. New fields are initially **Not assigned** until the administrator fills them in. No usernames, ranks or departments have been invented for real members. Existing members can keep logging in with their email. Once an administrator assigns a username, either that username or the email works for Orchestra login.

The login label is now **Username or email**. Orchestra usernames are unique, ignore letter case, and contain 3–40 letters/numbers/dots/underscores/hyphens. Club login continues to use its separate Club email account.

## Creating and activating an account

Create a member with a username, email, temporary password and personnel details. Give the member the credentials privately. The account receives an **urgent, mandatory activation task**.

The member signs in, opens their personal page or the activation task, and chooses their own password. The first password setting is activation and requires **no administrator approval**. Only a successful password change finishes that task; Complete and Decline cannot bypass it.

Creation does not automatically send an invitation email. If an email link is wanted, the administrator can use **Send activation email** in Accounts. Forgot Orchestra password also sends activation instructions directly for an account still awaiting activation; activated accounts continue through the administrator assistance workflow.

## Email changes

An administrator's email edit in Accounts takes effect without member verification. The Auth account and profile email are synchronized.

A member changes their own email through **Settings → Change your email → Send verification**. Their current address remains in use until the confirmation flow finishes. Follow the links requested by Supabase; depending on the secure email-change setting, both current and new addresses may require confirmation. The connected project's email confirmation setting was checked and is enabled.

## Tasks and unread notices

- Club registration tasks provide **Review registration**. They close only after Approve or Reject is saved. Ordinary Complete, Decline and Withdraw cannot resolve them. A later list refresh reconciles a saved Club decision if task synchronization was interrupted.
- Completed tasks includes both completed and declined tasks by default. Declined rows display **Declined**; the filter can show either status separately.
- The Task circle shows tasks still in New tasks. The Contact circle shows unread received messages from approved conversations. Each person also has their own unread-message circle.
- Reading a conversation records the displayed received messages as read. Read state is stored in Supabase and shared across sessions/devices. Chat polling preserves an unsent draft and selected attachment.
- In a notification, use **Reply to [name]** to answer a specific reply. The person being answered and the notification's author each receive a notice, with duplicate recipients and self-notices removed.
- The Notification circle counts unread reply notices. In Notification, the bottom-right **You have xx notices** rectangle expands into the notice list. Selecting an entry opens the notification. Opening its replies marks the displayed notices as read.

## Attachments and layout

Task, notification and chat attachments now allow **up to 10 MB per file**, including exactly 10 MB. Notification posts retain an eight-file maximum. Each chosen file has a **Remove** button before sending. Existing uploaded files remain accessible. The separate custom background image limit remains smaller than 3 MB.

The Background color control is smaller, Manage chat requests uses smaller text, and the time fields are wider so AM/PM fits while preserving minute entry.

## Applied backend changes

In COPKU DATA (`mqthckhoxtqtyuhtdunl`):

- Applied `supabase/portal/04_portal_v124.sql` and an index for the administrator event-to-task link.
- Added personnel fields, protected task actions, activation/email synchronization, private reply notices, chat read receipts and login attempt limiting.
- Updated the private attachment bucket limits to 10 MB.
- Deployed `portal-login`, `portal-account`, `create-internal-user`, `portal-password-help` and `portal-admin`. Their code performs authentication/authorization; their legacy gateway Verify JWT setting is disabled.

Do not rerun old v1.20/v1.23 SQL over this update: it can replace the new functions or attachment limit. The v1.24 SQL is supplied as a record of the applied migration. On a fresh restore, apply the existing base scripts in order and this script last; it is not a standalone initial schema.

## Verification

Live database tests passed for read-only personnel, valid rank/instrument combinations, mandatory activation, email synchronization, decision-only Club tasks, both reply recipients, cross-notification reply rejection, private notices, unread chat isolation and the inclusive 10 MB boundary. Temporary test records were rolled back; zero temporary test accounts remain.

Automated handler and interface tests covered admin authorization, immediate admin email edits, username/email login, uniform invalid-credential errors, first activation without approval, selected-file removal, dependent dropdowns, personal page rendering and declined-task display. No real member's email or password was changed for testing, and no test email was sent.

Browser visual QA could not run because the managed preview service was unavailable. Check the private preview before publishing your public website. The preview's sample accounts and password/email actions never change real accounts.
