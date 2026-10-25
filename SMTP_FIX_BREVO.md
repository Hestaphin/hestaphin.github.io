# Fix Supabase recovery email with Brevo

The website calls Supabase Auth to send recovery emails. Supabase then uses the SMTP settings saved in the project that owns the account. “Error sending recovery email” is a general failure message; the specific cause must be read from the failed Auth log entry. The website update does not change your Brevo or Supabase account settings.

## 1 Open the correct Supabase project

For Orchestra member invitation emails and the administrator's Send reset email button, use the ORCHESTRA project.

For Club confirmation and Forgot Club password emails, use the separate CLUB project.

If both projects send email, configure SMTP in both projects. A setting saved in one does not configure the other.

## 2 Find your Brevo SMTP credentials

Open https://app.brevo.com/settings/keys/smtp in your own browser.

Copy the value shown as SMTP login. It may be your email address or an address ending in `@smtp-brevo.com`. Use the value displayed there exactly.

Create an SMTP key there if you do not have one. Use this SMTP key as the password in Supabase. Keep the key private. Brevo API keys and the password you use to log into the Brevo website are separate credentials.

## 3 Save the settings in Supabase

Open https://supabase.com/dashboard/project/_/auth/smtp and select the project from step 1. Enable custom SMTP, fill in the following fields and save.

| Supabase field | Value |
| --- | --- |
| SMTP host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | The exact SMTP login shown on Brevo's SMTP page |
| Password | Your Brevo SMTP key |
| Sender email | The exact sender address you have configured and verified in Brevo |
| Sender name | `COPKU` |

Check the host for accidental spaces. Do not include `https://` in the SMTP host.

In Brevo, confirm that the sender is verified, its domain is authenticated, and transactional sending is active. If your account reports that SMTP is not activated, resolve that with Brevo support. If you enabled SMTP-key IP restrictions, make sure they allow the sending Supabase service; a restrictive allowlist can prevent authentication. Check your plan's sending allowance if Brevo reports a limit or suspension.

## 4 Test once and inspect the result

Request a new reset email for an existing account in that same project. Allow the configured resend interval before another attempt. Repeated clicking can hit rate limits.

If it still fails:

1. Open Supabase Logs and select Auth in the project that sent the request.
2. Find the newest failed request whose path contains `/recover`.
3. Open its details and find the `error` field. Copy that error text rather than only the generic message.
4. Check Brevo's transactional email logs at the same time for a rejection or blocked sender.
5. Share the error text with the website maintainer. Remove keys, passwords, tokens and unnecessary personal information first.

Examples of what the detail may indicate:

| Error detail | Check next |
| --- | --- |
| SMTP authentication failure or `535` | SMTP login and SMTP key, plus any SMTP-key IP restriction |
| Sender rejected or sender not verified | Sender email in Supabase versus the verified Brevo sender |
| SMTP account not activated | Brevo transactional sending activation |
| Connection timeout, connection refused or host lookup failure | Host spelling, port and connectivity; Brevo supports port 2525 as an alternative if 587 is blocked |
| Invalid email template | Supabase recovery email template; use the standard `{{ .ConfirmationURL }}` link |
| Rate limit, quota or suspension | Supabase and Brevo sending limits/account status |

These are diagnostic possibilities, not a confirmed explanation of your current error. If the log reports a database, template or Auth-hook error, follow that evidence rather than changing SMTP credentials repeatedly.

## 5 Check the link destination after delivery works

For an administrator's Orchestra reset email, the website specifies `/portal/reset-password/`. For Club recovery it specifies `/portal/membership/?set_password=1`. Add the corresponding full HTTPS URL to the correct project's Authentication redirect allowlist. Keep the confirmation/recovery email template's standard `{{ .ConfirmationURL }}` link unless you intentionally implement another supported flow.

This destination check concerns the link after it is sent. It does not establish the cause of a failed SMTP send.

## Official references

- Brevo SMTP settings and credentials: https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP
- Brevo SMTP ports: https://help.brevo.com/hc/en-us/articles/10905415650322-Which-SMTP-port-should-I-use-Port-587-465-or-2525
- Supabase custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp
