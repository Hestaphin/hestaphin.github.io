# Supabase and Stripe status — COPKU v1.23

The connected projects have already received this update. No CLI, new project, or new random value is needed for v1.23. Publish the website files using `UPDATE_FROM_v1.22.md`.

## Your actual projects

These IDs were read from your connected Supabase account, not generated as examples.

| Purpose | Actual project | Dashboard |
| --- | --- | --- |
| Orchestra portal and textbook shop | COPKU DATA — `mqthckhoxtqtyuhtdunl` | [Open COPKU DATA](https://supabase.com/dashboard/project/mqthckhoxtqtyuhtdunl) |
| Club signup and membership | COPKU Club — `fkbxifeeyaqutjprjghx` | [Open COPKU Club](https://supabase.com/dashboard/project/fkbxifeeyaqutjprjghx) |

The projects' public credentials are in `config.js`. Keep all service keys, Stripe API keys and webhook signing secrets off the website.

## Why Club approvals failed

The live Club database had `club_profiles` but no `approval_status` column. The old `portal-admin` function requested that column and returned HTTP 400; the old frontend displayed only “Edge Function returned a non-2xx status code”.

The repair has been applied in COPKU Club. The existing profile is pending, and the project contains one verified email account. No applicant was automatically approved.

After publishing v1.23, sign into the Orchestra administrator portal and open Settings → Club approvals. Review the applicant and select Approve or Reject. The new frontend displays specific configuration errors and a Retry button if another issue remains.

The redeployed Orchestra `portal-admin` function validates your Orchestra session and admin profile in its code. Its legacy gateway Verify JWT setting is off. Club profile reads use the existing Club bridge credentials stored in Orchestra Edge Function Secrets. Those credentials were not displayed or copied into the ZIP.

### Restore the approval repair later, if required

Open **COPKU Club → SQL Editor → New query**. Paste the complete contents of `supabase/club/migrations/202610230003_club_approval_repair.sql` and click Run. This can be run again and preserves existing approval decisions. Do not rerun the Club base schema on an existing project.

Open **COPKU DATA → Edge Functions → portal-admin → Code**. Replace `index.ts` with `supabase/functions/portal-admin/index.ts` and deploy. This function performs its own session and admin checks; retain its current disabled legacy Verify JWT setting.

If needed, the existing bridge settings are under **COPKU DATA → Edge Functions → Secrets**:

| Name | Value |
| --- | --- |
| `CLUB_SUPABASE_URL` | `https://fkbxifeeyaqutjprjghx.supabase.co` |
| `CLUB_SERVICE_ROLE_KEY` | The secret or legacy service_role key belonging to COPKU Club, entered privately in the Dashboard. |

The admin list also synchronizes reminders when an administrator opens the portal, so a missed database webhook does not prevent review. Keep any existing Club database webhook in place. No new database webhook is required for this update.

## Notification attachments

Already applied in COPKU DATA: `supabase/portal/03_notification_attachments.sql`.

The private `portal-notification-files` bucket accepts files smaller than 5 MB (5 × 1024 × 1024 bytes). Exactly 5 MB is rejected by the browser, database metadata check and Storage bucket limit. Signed download links expire after five minutes; reopening the notification generates fresh links. The existing `portal-images` bucket is retained for older image posts.

The separate custom background image limit remains smaller than 3 MB. Task/chat attachments retain their existing limit.

## Textbook shop

See `SHOP_STRIPE_SETUP_v1.23.md`. Its price, functions, order tables and signed webhook are already connected in live mode. Order delivery is handled by your team using the buyer's checkout contact details.

## Verification record

- Confirmed the approval column exists and the existing registration remains pending.
- Confirmed notification files are private and Storage caps uploads at 5 MB minus one byte.
- Confirmed anonymous users cannot read shop orders or apply payments, and ordinary members cannot retrieve the webhook signing secret.
- Ran database checks for unpaid checkouts, price/metadata mismatch, paid-state preservation, duplicate Stripe events and attachment size boundaries. Temporary test rows were rolled back.
- The live shop health check returned ready, USD and 500 cents. A correctly signed harmless webhook probe returned HTTP 200. No customer charge was made.
- The admin approval handler's authentication, admin role, error handling and decisions passed mock tests. A signed-in administrator still needs to review the real applicant in the portal.
- Browser rendering was not verified because the managed preview service was unavailable.

The security advisor still reports pre-existing warnings for helper function permissions, an unset search path and leaked-password protection. The new payment and secret functions are restricted to service_role; `club_is_approved` is callable by signed-in users only and checks their own account. Backend event tables intentionally have RLS with no browser policies. Reference: [Supabase function permissions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Automatic approval review blocked changing the separate Club membership checkout's legacy JWT setting, because that live function serves membership purchases beyond this shop/approval update. That setting was left unchanged. The textbook shop functions and approval repair were deployed successfully.
