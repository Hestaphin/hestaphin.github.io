# v1.25 setup status

No additional manual Supabase or Stripe setup is needed for the currently connected projects. The public website still needs the new website files uploaded. Do not rerun the historical v1.19 setup instructions.

| Component | Configured value |
| --- | --- |
| Orchestra/shop project | COPKU DATA — `mqthckhoxtqtyuhtdunl` |
| Club project | COPKU Club — `fkbxifeeyaqutjprjghx` |
| Refund database update | `supabase/shop/02_shop_refunds_v125.sql` |
| Admin refund function | `shop-refund` |
| Shop orders/admin function | `portal-admin` |
| Payment/refund webhook function | `shop-stripe-webhook` |
| Stripe account | COPKU, live mode |
| Existing shop webhook | `we_1UTa4hGdgIKGS7dTcLR2aVmi` |

The shop webhook retains its original four Checkout events and now also receives `refund.created`, `refund.updated`, `refund.failed`, `charge.refunded` and `charge.refund.updated`. The separate Club membership webhook is unchanged.

Server functions authenticate the current Supabase user and check the database admin role before refunding. The browser supplies an order ID and requested amount, not a Stripe API key or payment destination. A locked database reservation and Stripe idempotency key prevent duplicate confirmations. Refund events fetch the current Stripe refund before updating totals, and refunds for payments outside this shop are ignored.

Stripe secrets remain in server settings and encrypted Vault storage; no new secrets are included in this ZIP or required in `config.js`. The existing live shop secret is reused. A restricted key used in a future restore must permit the shop's Checkout/price operations plus refund creation, refund reading and payment reading; follow Stripe's current permission names.

## Only when restoring to another project

1. Restore the existing base Orchestra/portal/shop SQL in order, then run `supabase/shop/02_shop_refunds_v125.sql` in the **Orchestra** SQL Editor.
2. In Supabase Dashboard → Edge Functions → Deploy a new function → Via Editor, deploy the matching `supabase/functions/shop-refund/index.ts`, `portal-admin/index.ts` and `shop-stripe-webhook/index.ts` under their exact names.
3. These functions keep legacy Verify JWT disabled because their code validates either the signed-in admin with Auth or the Stripe webhook signature. Do not remove those checks.
4. Reuse the matching server-side `SHOP_STRIPE_SECRET_KEY` (or `STRIPE_SECRET_KEY`). The webhook signing secret remains `SHOP_STRIPE_WEBHOOK_SECRET` or the Vault secret `copku_shop_stripe_webhook`.
5. In Stripe Dashboard → Developers/Workbench → Webhooks, use your shop endpoint `/functions/v1/shop-stripe-webhook` and enable the nine events above. Keep account, price and mode consistent. The original setup and exact existing IDs remain in `SHOP_STRIPE_SETUP_v1.23.md`.
6. Use a separate Stripe test environment with matching test prices and secrets for test purchases. No real refund is required merely to deploy this update.
