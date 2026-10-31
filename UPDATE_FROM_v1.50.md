# COPKU v1.51 — Debussy textbook and US$4 shop prices

This update-only ZIP is for a complete v1.50 orchestra website. The separate email website is unchanged.

## Install on Netlify

1. Back up your complete v1.50 website folder.
2. Unzip `COPKU_v1.51_Update_Only.zip`. Copy the contents of its inner folder into your complete website folder, replacing matching files and keeping the rest.
3. Deploy the entire merged website folder to Netlify. Do not deploy this update ZIP by itself.
4. Hard-refresh with Ctrl+Shift+R (Windows) or Command+Shift+R (Mac).

## Shop changes

| Product | New price |
| --- | --- |
| Chopin theme textbook | US$4.00 |
| Debussy theme textbook | US$4.00 |

Debussy has its own product page at `/shop/debussy-theme-textbook/`, plus Buy and Add to cart actions. Your uploaded cover is copied exactly to `assets/shop-debussy-cover.png`, with no cropping, recolouring or edits. Its printed concert date is artwork, not a product publication date. No extra contents, availability or delivery promises have been invented.

Both products appear in shop search, work together in the cart, and show readable product names in the administrator's order table and order details. English and Chinese labels are included. Cart calculations and checkout use the new prices; cached shop modules are versioned to refresh them.

## Stripe and Supabase are already updated

No manual Stripe, Supabase, SQL or secret configuration is needed for this release.

- Live COPKU Stripe product and one-time US$4 price created for Debussy.
- New US$4 one-time price created for the existing Chopin product and set as its default. The old US$5 price is archived for new purchases; its historical records are retained.
- Orchestra Supabase `create-shop-checkout` deployed as version 7. Both server-owned catalogue entries validate the real Stripe price's amount, USD currency, active state and associated product before opening checkout.
- Required postal delivery address collection, payment webhooks, refunds and order status handling remain in place. Existing paid orders retain their original recorded amounts.
- Price IDs and subtotal are now included in the checkout fingerprint so an old-priced pending request cannot be reused as a newly priced cart. If an old browser shows a changed-checkout message, start a new checkout.

The backend uses the verified live US$4 price IDs included in its server source. The former `SHOP_CHOPIN_STRIPE_PRICE_ID` setting, which pointed at the old US$5 price, is no longer used by this version. Optional amount-specific override variables are `SHOP_CHOPIN_USD_400_STRIPE_PRICE_ID` and `SHOP_DEBUSSY_USD_400_STRIPE_PRICE_ID`; neither needs to be added for the connected COPKU shop.

The included backend files record what has already been deployed. You do not need to upload them manually through the Supabase dashboard.

## Verification

Live checkout health returned ready with both products at 400 USD cents and required delivery address collection. Stripe confirmed both active US$4 prices and the archived US$5 price. Local checks covered a mixed cart, quantity calculations, client price tampering, incorrect Stripe amount/currency/product, stale-price request rejection, historical order verification and administrator address access. No real purchase or payment was made.

The supplied cover's bytes match the new asset exactly. Runtime file syntax, build copies and update ZIP hashes are checked. Browser visual review depends on the managed preview service being available.
