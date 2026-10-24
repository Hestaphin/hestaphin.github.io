# v1.24 verification

## Live Supabase

Applied the personnel/notices/activation migration and admin task-link index to COPKU DATA. Deployed the five updated login/account/admin functions. Verified both attachment buckets have a 10,485,760-byte limit, all eight requested personnel/activation columns exist, anonymous users cannot read reply notices, and members cannot call the privileged Club task-resolution function.

Rolled-back database checks passed for:

- Valid personnel fields and rejection of an enlist/officer rank mismatch.
- Member read-only access to personnel details.
- Creation of a mandatory urgent activation task, rejection of generic completion, and completion after Auth password changes.
- Pending email retaining the current profile address and confirmed Auth email changes synchronizing to profiles.
- Club review tasks rejecting Complete/Decline until an actual service-side decision resolves the recipients.
- Notification author and reply target both receiving a notice, no self-notices, and rejection of targets from another notification.
- Own-notice RLS, own read updates, private chat unread counts and rejection of read receipts for another conversation.
- Acceptance at exactly 10 MB and rejection one byte above it.

All temporary records were rolled back. A separate check confirmed zero temporary Auth test accounts. Empty unauthenticated requests to the live login/account endpoints return errors rather than a session or member data.

## Local code and interface checks

Passed personnel catalogue and cascade validation, admin account handler authorization and cleanup, admin email confirmation override, protection of role/activation fields from submitted personnel data, username/email login and rate limiting, activation help without administrator approval, selected-file removal, dependent form choices, private demo notices/read receipts, default personal-page rendering, protected-task buttons and declined rows in Completed tasks.

The existing About-style search checks and the retained shop integration checks pass. The original assets remain unchanged, all v1.19 files remain included, and the release ZIP is byte-verified by its packaging helper.

## Limits and existing advisories

The managed preview supervisor is unavailable, so browser rendering and visual AM/PM clipping could not be verified. No real member email/password was changed, no mail was sent, and no Stripe payment was charged during these checks.

The new authenticated unread/read functions intentionally operate on the signed-in user's approved conversations. New trigger and service-only functions revoke browser execution. Existing advisor warnings remain for older helper permissions, the older set_updated_at search path, duplicate legacy policies and disabled leaked-password protection. The login-limit table deliberately has RLS and no browser policy.

References: [Supabase function execution permissions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [search path advice](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [RLS performance](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan), and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
