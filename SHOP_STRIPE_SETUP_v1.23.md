# COPKU textbook shop — live Stripe setup

The shop sells **Chopin theme textbook** for **US$5.00 per copy**, a one-time payment in the connected **COPKU** Stripe account. This price and manual delivery were confirmed during this update. Buyers can use Buy or the shopping cart, set a quantity and continue to Stripe Checkout.

The orchestra arranges delivery using the email/contact details collected at checkout. No automatic digital download, shipping price or delivery date has been promised. Paid orders appear in the administrator portal under **Settings → Shop orders**. Mark delivered after your team has completed delivery.

## Already configured

| Item | Actual value |
| --- | --- |
| Stripe account | COPKU — live mode |
| Product | `prod_VUZ2swrv0MfrI5` |
| One-time price | `price_1UTZupGdgIKGS7dTpEQZ5kaE` — 500 USD cents |
| Price lookup key | `copku_chopin_textbook_usd_500` |
| Supabase project | COPKU DATA — `mqthckhoxtqtyuhtdunl` |
| Checkout function | `create-shop-checkout` |
| Payment webhook function | `shop-stripe-webhook` |
| Stripe webhook | `we_1UTa4hGdgIKGS7dTcLR2aVmi` |
| Webhook endpoint | `https://mqthckhoxtqtyuhtdunl.supabase.co/functions/v1/shop-stripe-webhook` |
| Webhook signing secret | Encrypted in COPKU DATA Vault under `copku_shop_stripe_webhook`; never included in the website or this ZIP. |

The Stripe IDs above were returned by Stripe when the live product, price and webhook were created. Manage them in the [Stripe product catalogue](https://dashboard.stripe.com/products) and [webhook settings](https://dashboard.stripe.com/webhooks).

The webhook listens for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`. It verifies the signature and retrieves the actual Stripe session before changing an order. A success-page query parameter never marks an order paid.

The existing Orchestra server-side `STRIPE_SECRET_KEY` works with this price: the live readiness check passed. Neither the API key nor signing secret is in browser configuration. The existing Club membership webhook remains separate.

## Website publication

Publish the complete `shop/` folder from v1.23 and keep the current public Supabase configuration. `shop/shop-config.js` enables checkout. The server already allows these exact origins:

- `https://www.pkuco.org`
- `https://pkuco.org`
- `https://hestaphin.github.io`
- `https://copku-v120-portal-preview.neonlake16.chatgpt.site`

For another domain, open **COPKU DATA → Edge Functions → Secrets** and set `SHOP_SITE_ORIGINS` to a comma-separated list of the exact origins you use, including `https://`. This setting replaces the defaults. It is a domain list, not a password or random value.

## Restore or move the integration later

No repeat setup is needed for the connected projects. To restore elsewhere using the Dashboard:

1. Run `supabase/shop/01_shop_orders.sql` in the Orchestra project's SQL Editor. Vault must be available for its encrypted-secret helper.
2. Deploy `supabase/functions/create-shop-checkout/index.ts` as `create-shop-checkout`, and `supabase/functions/shop-stripe-webhook/index.ts` as `shop-stripe-webhook`. Retain disabled legacy Verify JWT for these functions: guest checkout validates its cart/origin, and the webhook validates Stripe signatures.
3. In Edge Function Secrets, set `SHOP_STRIPE_SECRET_KEY` privately if the existing `STRIPE_SECRET_KEY` is unavailable. Prefer a restricted key with the needed Checkout Sessions, customer and price permissions. Match its Stripe account and mode to the price.
4. Set `SHOP_CHOPIN_STRIPE_PRICE_ID` to the appropriate one-time USD500 price and `SHOP_SITE_ORIGINS` to your exact site origins. These override this release's defaults.
5. Create the Stripe webhook using the four events listed above. Store its signing secret privately as Edge Function Secret `SHOP_STRIPE_WEBHOOK_SECRET`, or in Vault under `copku_shop_stripe_webhook`. An explicit Edge Function Secret takes precedence over Vault.
6. In a separate test environment, use matching test prices, API keys and webhook secrets. The live price in this package is not a test price.

`SHOP_SHIPPING_COUNTRIES` can optionally collect a shipping address; use comma-separated country codes such as `CN,US`. Leave it unset while delivery is coordinated directly with the buyer. `SHOP_CURRENCY` defaults to `usd`; a different currency requires changing the catalogue/display and the Stripe price together.

## Checks performed

Validated the live price and database connection, signed webhook delivery, strict server prices/cart quantities/origins, request reuse, payment lookup, duplicate-event handling and private order access. No real payment was charged; checkout UI rendering and a completed real buyer transaction remain unverified.
