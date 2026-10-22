# COPKU v1.20 Supabase setup

This release updates the Orchestra portal on the supplied v1.19 source. Complete this guide before expecting the portal to work. The website ZIP does not configure your Supabase projects or deploy Edge Functions for you. Public website pages and their assets remain in the package.

## 1 Choose the two projects

Use your existing Orchestra project for Orchestra accounts and a DIFFERENT Supabase project for Club accounts. Do not put Club tables in the Orchestra project. Keep a record of which Dashboard browser tab belongs to which project.

In each project find its Project URL and publishable key using the Connect dialog or Settings → API Keys. Edit the website root `config.js`:

```js
window.PUCO_SUPABASE_URL = 'https://YOUR_ORCHESTRA_REF.supabase.co';
window.PUCO_SUPABASE_ANON_KEY = 'YOUR_ORCHESTRA_PUBLISHABLE_KEY';
window.COPKU_CLUB_SUPABASE_URL = 'https://YOUR_CLUB_REF.supabase.co';
window.COPKU_CLUB_SUPABASE_PUBLISHABLE_KEY = 'YOUR_CLUB_PUBLISHABLE_KEY';
```

The `ANON_KEY` variable name is retained for compatibility; a publishable key belongs there. Retain the existing Orchestra values if that project is still yours. Never place a secret key or service_role key in website JavaScript.

## 2 Create the Orchestra base database

In the ORCHESTRA project open SQL Editor. If you have never run the old base schema and there is no `public.profiles` table, paste and run `supabase/schema.sql` from this ZIP ONCE. It creates the original profiles and legacy message tables. Its membership tables are historical and are not used for the separate Club system.

If `profiles` and the old schema already exist, skip that file. Do not run it again: its enum and policy statements are not repeatable. Do not delete existing users or tables.

Then run these two NEW files, in this order, once each:

1. `supabase/portal/01_portal.sql`
2. `supabase/portal/02_admin_events.sql`

The first installs task, notification, reply and chat tables, private upload buckets, permissions and transactional actions. It also replaces the old recursive administrator lookup. The second installs idempotent admin event tasks. These portal files are migrations, not scripts to rerun repeatedly. A failing migration rolls back its transaction; fix the error before retrying.

## 3 Create your first Orchestra administrator

If your administrator already has a `profiles` record with `role = admin`, keep it and skip this step.

In Orchestra Authentication → Users, add your administrator email, set a strong password and confirm the email using the Dashboard's administrative option. This is a one-time bootstrap for your own account. Copy its UUID. In SQL Editor run the following, replacing the UUID and email:

```sql
insert into public.profiles(user_id,email,full_name,role)
values ('PASTE_AUTH_USER_UUID','admin@pkuco.org','Administrator','admin')
on conflict(user_id) do update set role='admin';
```

Do not use a fixed public example password. Additional Orchestra accounts are created inside Portal → Accounts after the Edge Functions below are deployed. Members receive an email invitation and verify their mailbox by opening it. They can set their own password on that page; the admin-specified initial password is also set on account creation.

## 4 Configure email and callback URLs in BOTH projects

In Authentication settings enable the Email provider and Confirm email. Use your SMTP provider in Authentication email/SMTP settings so invitations, confirmations and reset emails reach real users. Configure its sender address and test delivery.

Set the Site URL to your actual website origin, for example `https://www.pkuco.org`.

In the Orchestra project's redirect URL allowlist add:

- `https://www.pkuco.org/portal/reset-password/`

In the Club project's redirect URL allowlist add:

- `https://www.pkuco.org/portal/membership/`
- `https://www.pkuco.org/portal/membership/?welcome=1`
- `https://www.pkuco.org/portal/membership/?set_password=1`

Replace the host everywhere if you use another host. Include equivalent HTTPS preview-host URLs if testing there. Keep the trailing slashes. Confirmation and reset flows must return to the correct project-specific page.

Orchestra “Forgot password?” creates an urgent mandatory admin task rather than automatically resetting access. The public endpoint returns the same response whether or not the email exists; duplicate requests for an account are coalesced to one task per UTC day. It is a request for help, not proof of identity. The administrator should verify the person before sending a reset email from Authentication → Users. The administrator can use the “Send reset email” button beside a member in Portal → Accounts after verifying their identity. It uses Supabase's normal reset email and an explicit redirect to `/portal/reset-password/`. Keep the default `{{ .ConfirmationURL }}` link in the email template; do not substitute a token hash for an access token.

Club “Forgot password?” sends the normal Supabase recovery email and returns to the Club portal.

## 5 Create the Club database

In the separate CLUB project SQL Editor, run these in order:

1. `supabase/club/migrations/202610200001_club_basic.sql` — only if you have not done v1.19 Club setup.
2. `supabase/club/migrations/202610220002_club_approval.sql` — the new approval requirement.

All Club profiles, including any existing accounts, start with `approval_status = pending` when the second migration runs. Review and approve legitimate existing members. A user's profile stays readable to that user so they can see pending/rejected feedback, but paid plans, orders and checkout require approval. New registrations require both email confirmation and administrator approval. A pending member can still use password recovery.

## 6 Deploy Orchestra Edge Functions

In ORCHESTRA Edge Functions create/deploy each function with the exact name below, pasting the matching `index.ts`:

| Function name | Source file |
| --- | --- |
| `create-internal-user` | `supabase/functions/create-internal-user/index.ts` |
| `delete-internal-user` | `supabase/functions/delete-internal-user/index.ts` |
| `portal-admin` | `supabase/functions/portal-admin/index.ts` |
| `portal-password-help` | `supabase/functions/portal-password-help/index.ts` |
| `portal-club-event` | `supabase/functions/portal-club-event/index.ts` |

Disable the legacy gateway JWT verification switch for these functions (CLI equivalent is the supplied `supabase/config.toml`). The administrator functions validate the caller's real Orchestra access token and admin profile inside their code. Password help is intentionally public. Club events require the shared secret header.

In ORCHESTRA Edge Function Secrets add:

| Secret | Value |
| --- | --- |
| `SITE_URL` | `https://www.pkuco.org` or your real website origin |
| `CLUB_SUPABASE_URL` | URL of the separate Club project |
| `CLUB_SERVICE_ROLE_KEY` | Club project's legacy `service_role` key from API Keys |
| `PORTAL_BRIDGE_SECRET` | A newly generated long random string, at least 32 random bytes |

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for the Orchestra runtime. Do not paste private values into source files. The Club service key is used only by the Orchestra server functions to review/approve Club accounts.

Optional command-line alternative — skip this block if you deployed the five functions using the Supabase Dashboard. CLI means typing commands in a Terminal. From the website root after logging into the Supabase CLI:

```sh
supabase link --project-ref YOUR_ORCHESTRA_REF
supabase functions deploy create-internal-user --no-verify-jwt
supabase functions deploy delete-internal-user --no-verify-jwt
supabase functions deploy portal-admin --no-verify-jwt
supabase functions deploy portal-password-help --no-verify-jwt
supabase functions deploy portal-club-event --no-verify-jwt
```

## 7 Make Club signup generate the admin task immediately

In the CLUB Dashboard go to Integrations → Database Webhooks and enable webhooks if needed. Create a webhook:

- Name: `club-registration-admin-task`
- Table: `public.club_profiles`
- Event: INSERT
- HTTP method: POST
- URL: `https://YOUR_ORCHESTRA_REF.supabase.co/functions/v1/portal-club-event`
- Header `Content-Type`: `application/json`
- Header `x-portal-secret`: the same `PORTAL_BRIDGE_SECRET` as step 6

Create the Orchestra administrator BEFORE testing this webhook. Register a new Club account and check that an urgent mandatory “Club registration approval” task arrives in the Orchestra admin's New tasks. The webhook only queues the review task; it does not approve the account.

If a webhook delivery fails, opening the admin portal or its Club approvals section also synchronizes pending registrations and creates missing tasks once per registration. Check the webhook/Edge Function logs if immediate delivery fails. Review a registration in Portal → Club approvals and choose Approve or Reject, then complete the associated task.

## 8 Paid Club upgrades and Stripe

If you only want the new Orchestra portal now, you can stop before Stripe setup; tasks, notifications, chat and Club approval do not require Stripe.

For paid Club upgrades follow the included `supabase/club/SETUP.md` for Stripe prices, webhook signing secret and Club function deployment. It is the v1.19 reference: this v1.20 guide overrides its immediate Basic access and setup order. Deploy the UPDATED `supabase/club/functions/create-club-checkout/index.ts` from this ZIP, which also checks administrator approval, plus the existing `club-stripe-webhook` function. Deploy these two in the CLUB project, not Orchestra. Disable the legacy JWT gateway for Club checkout too: the function validates the token with Club Auth inside its code. Use the updated Club `config.toml` and set Stripe secrets in that project only. Keep plans inactive until real Stripe price IDs and webhook configuration are ready.

## 9 Upload and test the website

Upload the CONTENTS of `COPKU_Website_v1.20` to your static website root. Keep `/portal`, `/login`, `/club`, assets and all the existing public-page folders. The site uses paths from the domain root, so serve it at `/`, not under a repository-name subdirectory. The top-level public site pages are retained from v1.19.

Test with an administrator and two separate Orchestra member accounts, preferably in separate browser profiles:

1. Sign in through Login → Orchestra. Create a member in Accounts, verify the invitation email, sign in as that member and change their password in Settings.
2. Send a mandatory urgent task with date-only duration and an attachment. Confirm the next-day 00:00 end boundary, red exclamation mark, login reminder and unseen review status.
3. Open the task; accept it; check Outstanding; complete it; check Completed and the sender's Review. Decline another mandatory task with a reason: the sender receives a mandatory seven-day feedback task. Optional decline also asks for confirmation and sends feedback.
4. Withdraw a sent task and refresh the recipient: it disappears. Already issued download URLs expire after five minutes.
5. Post a text/image notification, pin it as admin, open as member, reply, and confirm grey read styling. An unread pinned item is yellow. Delete it as admin.
6. Send a chat request. The recipient sees it at next login or under Manage chat requests. Approve, send text/file messages, then revoke and confirm further sends/history access are blocked. Open chats refresh every 15 seconds when there is no draft; Refresh is available immediately. Up to the first 500 messages are displayed in this release.
7. Search titles/content/members in the current portal section; change the background color/image and reload. Images must be smaller than 3 MB and PNG/JPG/WebP/GIF. Backgrounds are personal browser settings. Task formatting applies to the whole task body.
8. Request Orchestra password assistance and check the mandatory urgent admin task. Test the administrator's reset-email action and reset page.
9. Register a Club account, verify its email and confirm it cannot enter the member features/pay until approved. Check the urgent admin task, approve in Club approvals, then sign in again. Test Club password recovery.
10. Check an unrelated member cannot read another person's tasks, chat messages or task/chat attachments through the API. Only administrators should be able to initiate tasks, pin/delete notifications or create/delete accounts.

## Validation completed with this package

See `VALIDATION_v1.20.md`. Live email, database permissions, webhooks and Stripe must be tested after configuration in your own projects. They have not been deployed or tested against your live projects here.

Official references: https://supabase.com/docs/guides/database/postgres/row-level-security and https://supabase.com/docs/guides/auth/passwords
