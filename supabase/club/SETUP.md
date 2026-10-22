# Club accounts and payments — v1.19

The website code is ready. The new Club Supabase project and its Stripe functions still need to be configured and deployed using the steps below. No changes have been applied to your live Supabase database.

## Account systems

| | Orchestra | Club |
| --- | --- | --- |
| Supabase project | Existing project in `config.js` | A new, separate project |
| Login | Login window → Orchestra | Login window → Club |
| Portal | `/portal/internal/` | `/portal/membership/` |
| Account creation | Existing orchestra administrator | Free signup on `/opportunities/club/` |
| Profile | Existing `profiles` table | New `club_profiles` table |
| Browser session | `copku-orchestra-auth-v1` | `copku-club-auth-v1` |

The same email can have different passwords in the two projects. Signing out of Club does not sign out of Orchestra. The shared login window is only a visual chooser. Club never falls back to the orchestra project, and a configuration pointing both systems at the same project is rejected. Orchestra users will sign in once again after this update because their browser storage key is now explicit.

## 1. Create the Club project and tables

1. In the Supabase Dashboard, create a **new project**, for example `COPKU Club`. Keep the existing orchestra project.
2. Open the **new Club project's SQL Editor**. Copy and run the complete contents of `migrations/202610200001_club_basic.sql` from this folder.
3. Check Table Editor: `club_profiles`, `club_plans`, `club_checkout_requests`, and `club_orders` should exist. The script refuses to run in a project containing the old orchestra `profiles` or `internal_messages` tables.

New Auth users receive `Membership Basic` automatically from a database trigger. Registration costs nothing and does not require Stripe. A browser cannot insert a paid profile or modify a membership tier. Members can read only their own profile and orders. Expired paid members retain Basic portal access.

## 2. Enable free email/password registration

In the **Club project**:

1. In Authentication settings, allow new user signups and enable the Email provider with password login. Set the minimum password length to at least 8 characters. Keep email confirmation enabled.
2. Configure **custom SMTP** for public registration. Supabase's default email sender is restricted to your project team's addresses; it is not sufficient for general Club registrations.
3. In Authentication → URL Configuration, set Site URL to:

   `https://copku-homepage-october-2026.neonlake16.chatgpt.site`

4. Add these Redirect URLs exactly (substitute your real domain in all three places if you use another host):

   ```text
   https://copku-homepage-october-2026.neonlake16.chatgpt.site/portal/membership/
   https://copku-homepage-october-2026.neonlake16.chatgpt.site/portal/membership/?welcome=1
   https://copku-homepage-october-2026.neonlake16.chatgpt.site/portal/membership/?set_password=1
   ```

5. Keep the standard confirmation/recovery email templates using `{{ .ConfirmationURL }}`. Confirmation returns to the Club portal. “Forgot Club password?” sends a recovery email that returns to the portal's password form.

The website's current hosting audience remains owner-only. To let the public register at this URL, separately change the Site's audience when you are ready; this release does not change its audience.

In the **existing orchestra project**, leave registration under administrator control. Disable public user signup there if it is currently enabled; do not enable it to support Club.

## 3. Connect the website

From the Club project's connection/API settings, copy its **Project URL** and **publishable key** (a legacy public anon key is also accepted). Edit the website's `config.js`:

```js
// Keep the existing PUCO_SUPABASE_URL and PUCO_SUPABASE_ANON_KEY for Orchestra.
window.COPKU_CLUB_SUPABASE_URL = 'https://YOUR_CLUB_PROJECT_REF.supabase.co';
window.COPKU_CLUB_SUPABASE_PUBLISHABLE_KEY = 'YOUR_CLUB_PUBLISHABLE_KEY';
```

Redeploy the website after editing. Never put a `service_role`, `sb_secret_…`, Stripe secret, or database password in `config.js`. Until the separate Club credentials are filled in, registration and Club login remain unavailable instead of writing into orchestra accounts.

You can now register on `/opportunities/club/#club-registration-form`, confirm the email, log in through **Club**, and enter the free Club portal. The upgrade area remains unavailable until paid plans are configured below.

## 4. Enable upgrades and payment in the Club portal

All upgrades start from an authenticated Club portal. There is no public paid-registration form.

1. In Stripe **test mode**, create one-time prices matching the existing Club plans:

   | Plan | One payment | Duration |
   | --- | --- | --- |
   | Membership Standard | CNY 199.00 | 12 months |
   | Membership Supporter | CNY 399.00 | 12 months |
   | Membership Patron | CNY 999.00 | 12 months |

2. In the Club project's SQL Editor, replace all three `price_…` placeholders below with your actual Stripe Price IDs, then run:

   ```sql
   update public.club_plans set stripe_price_id = 'price_STANDARD', active = true
   where slug = 'Membership Standard';
   update public.club_plans set stripe_price_id = 'price_SUPPORTER', active = true
   where slug = 'Membership Supporter';
   update public.club_plans set stripe_price_id = 'price_PATRON', active = true
   where slug = 'Membership Patron';
   ```

   The function verifies the amount and currency against Stripe. Plans are initially inactive. Keep the plan names/slugs and ranking unchanged; use `description` for editable marketing copy.

3. In the **Club Supabase project's Edge Functions page**, click **Deploy a new function → Via Editor**. Create these two functions by pasting each complete, standalone file into `index.ts`, then click **Deploy function**:

   | Function name | File in this folder |
   | --- | --- |
   | `create-club-checkout` | `functions/create-club-checkout/index.ts` |
   | `club-stripe-webhook` | `functions/club-stripe-webhook/index.ts` |

   Each file includes its own imports and helpers. No local development or Supabase CLI is required.

4. In Stripe, create a webhook destination:

   `https://YOUR_CLUB_PROJECT_REF.supabase.co/functions/v1/club-stripe-webhook`

   Select `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`. Copy its signing secret (`whsec_…`).

5. In the **Club Supabase project's Edge Function secrets**, add:

   | Secret | Value |
   | --- | --- |
   | `STRIPE_SECRET_KEY` | Your Stripe test secret; switch to the matching live key when ready |
   | `STRIPE_WEBHOOK_SIGNING_SECRET` | The signing secret of the new webhook destination |
   | `SITE_URL` | `https://copku-homepage-october-2026.neonlake16.chatgpt.site` |

   Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to its functions automatically. These secrets belong in the backend only.

6. In the functions' authentication/settings panel, keep JWT verification **on** for `create-club-checkout`. Turn JWT verification **off only for `club-stripe-webhook`**, so Stripe can reach it. The checkout function also validates the Club user with Auth. The webhook verifies Stripe's signature on the raw request body. The supplied `config.toml` records these settings for anyone who later uses the CLI.

The server takes the user ID and email from the authenticated Club account, uses database prices, and fixes the return destination to the Club portal. It accepts no browser-supplied identity, amount or return URL. One open checkout per user is reused or expired before switching plans. The signed webhook checks payment, identity, price, amount and currency, then atomically writes the order and paid membership. Repeated webhook events do not extend access twice.

Paid membership is a one-time purchase, with no automatic renewal. Renewing the same active plan extends its existing paid-through date. Upgrading to a higher plan starts a fresh paid period at payment; remaining time is not credited. Active members cannot purchase a lower tier. These terms appear beside the payment button. Refunds/chargebacks require review in Stripe and an administrator entitlement adjustment; automated refund processing is not part of this update.

## 5. Existing Club accounts from the old shared system

Existing data is not deleted or silently reassigned. Old Club credentials belong to the orchestra Supabase project and **will not sign in to the new Club project**. If there are existing members:

1. Export only `profiles` with `role = 'member'` and their membership orders from the old project. Do not move admin/internal orchestra accounts or copy their passwords.
2. Have each Club member register with the same email in the new project, or invite them from the new Club project's Authentication → Users page. A new invitation should redirect to `/portal/membership/?set_password=1`. Reissue old activation/recovery emails from the **new** project.
3. For each existing paid membership, restore its verified entitlement using the **new Club SQL Editor**, after the new Auth account exists. Example — replace the email, tier and actual expiry with the old verified record:

   ```sql
   update public.club_profiles
   set membership_tier = 'Membership Standard',
       membership_status = 'active',
       paid_through = '2027-10-20T00:00:00Z',
       updated_at = now()
   where lower(email) = lower('actual-member@example.com');
   ```

   Keep old receipts/orders as an archive; this release does not automatically import historical billing rows. The new portal records new Club payments. Let expired users keep Basic access.
4. Stop new checkout creation in the old project by retiring its public `create-checkout-session` function. Settle any already-open old checkouts before disabling their old Stripe webhook; its webhook must not receive new Club events. The new webhook processes only sessions tagged `copku-club-v1`.

If a pending request has no Stripe session because a function stopped unexpectedly, inspect Stripe before changing that row. Never cancel a request after a successful payment without reconciling the order.

## Check before accepting live payments

Register Basic without paying; verify confirmation and password recovery; open the Basic portal; sign in to both systems with the same email; log out of Club and confirm Orchestra still works. Test each Stripe plan, cancellation and duplicate webhook delivery. A forged `?checkout=success` must not change a tier. Switch Stripe keys, Price IDs and the webhook signing secret together when moving from test to live.

The code was checked locally with mocked Auth/Stripe responses and an embedded PostgreSQL test database. No live account, email, charge or Supabase migration was performed. Visual browser testing was unavailable.

References checked 20 October 2026: [Supabase signup](https://supabase.com/docs/reference/javascript/auth-signup), [Auth triggers](https://supabase.com/docs/guides/auth/managing-user-data), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Edge Function authentication](https://supabase.com/docs/guides/functions/auth), [Dashboard function deployment](https://supabase.com/docs/guides/functions/quickstart-dashboard), [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment), [Stripe webhooks](https://docs.stripe.com/webhooks).
