# Shop — 19 October 2026

Updated 20 October 2026 (Asia/Shanghai): editable Buy quantities, selective cart checkout, Remove all, and a dedicated Contact page. All Contact links now use `/contact/`; the original homepage form remains at `/#contact`.

The Shop overview (`/shop/`) and the Chopin product detail (`/shop/chopin-theme-textbook/`) use the supplied Shop PNG and Word instructions. The original `A正面.png` is copied without alteration to `assets/shop-chopin-cover.png`.

The body stays black at every hour. The shared header, ordered navigation, weekend active/hover underlines, footer, red bottom bar, and hourly key signature remain in use. Five white staff lines and the same Bravura glyphs are drawn at the homepage's 23% opacity so the empty score remains visible on black. Product framing and the Buy/cart hover inversion are white and black.

Product information is limited to the supplied cover, “Chopin theme textbook”, and `$ 5.00`. No invented availability, shipping promise, release date, or contents are published. The concert date printed on the artwork is not used as a product release date.

The search uses the Events search controller, same panel, styles, explicit Search submission, month-only menus, year cap at current year + 1, unchecked newest-first order and scroll retention on folding. It searches product title, cover text metadata and the real product detail page. All years is selected initially because no product publication date was supplied; date/season filters exclude undated products.

The upper-right cart includes quantity controls, individual removal, Remove all, per-product checkboxes, Select all, and separate cart and selected subtotals. Checkout selected submits only checked products; unchecked products stay in the cart. Selections are saved with a separate browser key, and new additions are selected automatically. Quantity changes keep product order stable. Cart checkout also allows quantity changes before payment. Its product IDs and quantities are saved in browser local storage; prices always come from the catalog. It handles malformed or unavailable storage. Buy opens a checkout with editable quantity, plus and minus controls, and live line totals/subtotal; changing a direct purchase does not change the cart. Items are only subtracted from the cart after payment is verified by the server, preserving later additions. Payment cancellation and errors leave the cart intact.

## Payment activation required

**Product payments are not active.** `shop-config.js` deliberately leaves `PUCO_SHOP_CHECKOUT_ENABLED = false`; the review dialog and cart work, and attempting payment clearly says online checkout is unavailable and links to Contact. Checkout supports several distinct approved products through the server-owned catalogue (currently only the supplied Chopin product is published). The existing Supabase/Stripe connection is for membership purchases only and has not been changed. No payment was submitted during verification.

A complete separate Supabase function is included at `shop/backend/create-shop-checkout/index.ts`. It does not create memberships or access membership tables. To activate it using the Supabase Dashboard:

1. Create a **one-time** Stripe price for this product at **5.00**, confirming the intended dollar currency. The reference supplies `$` without an ISO currency; no currency has been guessed in server configuration.
2. Create and deploy a **new** Edge Function called `create-shop-checkout` using the supplied file. Disable its legacy JWT verification (`verify_jwt = false`); it is a guest checkout endpoint. The browser sends the project's existing publishable API key. Keep the existing membership function and webhook unchanged.
3. Set server secrets: `STRIPE_SECRET_KEY` (reuse the existing Stripe account key), `SHOP_CHOPIN_STRIPE_PRICE_ID` (the actual product price ID), `SHOP_CURRENCY` (the confirmed lowercase ISO code), and `SHOP_SITE_ORIGINS` (comma-separated exact HTTPS origins without trailing slashes). Include `https://copku-homepage-october-2026.neonlake16.chatgpt.site` and any separately hosted domain that should use this checkout.
4. If this is a physical publication, confirm delivery and fulfillment arrangements first. Optional `SHOP_SHIPPING_COUNTRIES` is a comma-separated list of supported two-letter countries for collecting a shipping address. It does not calculate shipping charges. No digital fulfillment or shipping rates have been invented.
5. Test with Stripe test credentials and the matching test price. The function validates product, integer quantity 1–99, configured currency, and the canonical 500-minor-unit price; it ignores any client prices or return URLs. Creation uses Stripe idempotency, and checkout return verifies the session's ownership metadata, actual subtotal and payment status. Order records and customer details are available in Stripe; the website does not implement order fulfillment. Configure receipts in Stripe as appropriate.
6. Set `PUCO_SHOP_CHECKOUT_ENABLED = true` in `shop/shop-config.js` and republish once the test and fulfillment setup are complete. Keep all secret keys on Supabase, never in browser files.

Official API references used for the prepared integration: [Stripe Checkout creation](https://docs.stripe.com/api/checkout/sessions/create), [session retrieval](https://docs.stripe.com/api/checkout/sessions/retrieve), and [Supabase function authentication](https://supabase.com/docs/guides/functions/auth).

## Verification

Shop cart/model, search, checkout request/error paths and the prepared server handler are checked with mocked storage, network and Stripe responses. Local links, unique IDs and all existing shared-page behavior are checked. The original account, contact and membership payment integrations remain byte-for-byte intact. No browser-control plugin was available, so visual browser QA and a live product payment remain unverified.
