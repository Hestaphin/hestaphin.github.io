# COPKU v1.33 — login recovery and remaining email activation

## Orchestra login

The shared `portal-login` function had a request that exhausted its execution time. The failed downstream request was the `portal_login_attempt` database security check (HTTP 522). Other portal API requests succeeded. This does not establish an incorrect password or a complete database outage.

This update:

- Ends an unresponsive server login after 15 seconds, aborts its database/Auth requests, and returns a service error. The attempt-limit check remains mandatory.
- Requests a fresh login independently of a previous browser session's token refresh.
- Ends the full browser sign-in process after 35 seconds and restores the Login button with an error.
- Distinguishes service failures from invalid credentials. Keeps role and user-ID checks, session isolation, and EN/中文 messages.
- Pins Supabase browser scripts to version 2.118.0 and refreshes page asset versions.

Upload the complete contents of `COPKU_Website_v1.33` to the hosting location for the main orchestra website. The separate email Netlify project still uses its own package. All original v1.19 file paths and images are retained.

The connected Supabase login function is patched separately by this update. If you need to install it manually: Supabase → COPKU DATA → Edge Functions → portal-login → Code, replace `index.ts` with `supabase/functions/portal-login/index.ts`, then deploy. Retain its existing legacy Verify JWT setting: OFF. The function checks the password and account role itself. Do not paste keys or passwords into this file.

The patch prevents indefinite waiting; a successful real administrator sign-in still requires the database/Auth services to respond. No account password was read or changed, and no successful administrator sign-in is claimed from automated fixture checks.

## Manual recovery if login still fails

1. Open Supabase → **COPKU DATA** → **SQL Editor** → **New query**. Run `select 1;`.
2. If this also times out, open **Project Settings → General → Restart project**. This briefly interrupts the orchestra portal and email backend. Wait until the project is healthy, then retry. This is a recovery step, not a guarantee that the underlying cause is removed.
3. Upload the v1.33 main website files, then test login in a private/incognito window to avoid old scripts or a stalled browser session.
4. If SQL runs but login still reports a service error, run the read-only `supabase/portal/13_login_diagnostics_v133.sql`, then inspect **Edge Functions → portal-login → Logs**. New timeout entries identify only the stage (`rate_limit`, `profile`, or `password`) without recording passwords or tokens. Keep the error text and stage for diagnosis. Do not disable the security check or reset member passwords as a workaround.

No new schema migration is required. Do not rerun previous setup SQL or the historical pg_net repair for this login patch.

## Email setup already completed

- Supabase mail tables, private storage, mail functions, and the six address/origin settings are installed.
- Brevo sender **admin@pkuco.org** is Verified; pkuco.org authentication is verified.
- Cloudflare CNAME **email.pkuco.org → super-blini-92715a.netlify.app** is configured, DNS only.
- Netlify custom domain **https://email.pkuco.org/** opens over HTTPS. Its existing Netlify project visibility remains private.
- Cloudflare MX records for **reply.pkuco.org** are configured: priority 10 `inbound1.sendinblue.com` and priority 20 `inbound2.sendinblue.com`.
- Existing public **admin@pkuco.org → hestaphin@gmail.com** forwarding remains active.

## Email setup still remaining — do in this order

1. Restore the shared Orchestra administrator sign-in first. Open **https://email.pkuco.org/** with access to the private Netlify project, then use the existing Orchestra administrator account.
2. In COPKU Mail open **Connection**. Check Sending address **admin@pkuco.org**, Reply-to address **admin@pkuco.org**, and Receiving domain **reply.pkuco.org**. Click **Register receiving webhook**. The app creates the Brevo webhook and authorization header on the server; you do not need to invent or copy a token. Confirm that Receiving webhook shows **Configured** (reopen Connection after registration if necessary).
3. In Cloudflare open **pkuco.org → Email Routing → Destination addresses → Add destination**. Enter **admin@reply.pkuco.org**. After step 2, its verification message should appear in COPKU Mail. Open that message and complete its verification link; if shown as text, copy the full link into your browser. Confirm the destination becomes verified in Cloudflare.
4. In **Email Routing → Routing rules**, edit the existing rule for **admin@pkuco.org** to forward to the verified **admin@reply.pkuco.org** destination. This moves new incoming messages from the existing Gmail destination to the private mailbox. If you want Gmail to receive a copy as well, keep the old rule until a separate copy-delivery arrangement is implemented. Do not replace the root pkuco.org MX records or add a duplicate admin rule.
5. From your own external email account, send a test to **admin@pkuco.org**. Confirm it appears in COPKU Mail. Compose a reply back to your own external account, then verify receipt, From/Reply-To, and attachments. A Sent status means Brevo accepted the message; check actual delivery too.

Sending and receiving have not yet been verified end to end. Website visibility is a separate Netlify setting: the present private project also requires Netlify access before reaching the administrator login page.

Official references:
- https://supabase.com/docs/guides/troubleshooting/failed-to-run-sql-query-connection-terminated-due-to-connection-timeout
- https://developers.brevo.com/docs/inbound-parse-webhooks
- https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/
