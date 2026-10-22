// Deploy as the NEW Supabase function "create-shop-checkout" (verify_jwt=false).
// No membership tables or membership webhooks are used.
const catalogue = [{ id: 'chopin-theme-textbook', priceCents: 500, priceSecret: 'SHOP_CHOPIN_STRIPE_PRICE_ID' }];
const requestPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sessionPattern = /^cs_(?:test_|live_)?[A-Za-z0-9]+$/;

// A server-owned catalogue allows several selected products in one checkout.
// Add approved products here and in shop-data.mjs when publishing new products.
export function createShopHandler(products = catalogue) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  function validItems(value) {
    if (!Array.isArray(value) || !value.length || value.length > 10) return null;
    const ids = new Set();
    const items = [];
    for (const line of value) {
      if (!line || !productMap.has(line.id) || ids.has(line.id) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) return null;
      ids.add(line.id); items.push({ id: line.id, quantity: line.quantity });
    }
    return JSON.stringify(items).length <= 500 ? items : null;
  }
  return async (req) => {
    const origins = (Deno.env.get('SHOP_SITE_ORIGINS') || '').split(',').map((value) => value.trim()).filter(Boolean);
    const origin = req.headers.get('Origin') || '';
    const headers = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Origin': origins.includes(origin) ? origin : 'null',
      'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
    const respond = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
    if (!origin || !origins.includes(origin)) return respond({ error: 'Origin is not allowed.' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return respond({ error: 'Method is not allowed.' }, 405);
    const secret = Deno.env.get('STRIPE_SECRET_KEY');
    const currency = (Deno.env.get('SHOP_CURRENCY') || '').toLowerCase();
    if (!secret || !/^[a-z]{3}$/.test(currency)) return respond({ error: 'Shop payment is not configured.' }, 503);

    async function stripe(path, options = {}) {
      const response = await fetch('https://api.stripe.com/v1' + path, {
        ...options, signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${secret}`, ...options.headers }
      });
      if (!response.ok) throw new Error('Payment service unavailable');
      return response.json();
    }
    try {
      const raw = await req.text();
      if (raw.length > 4096) return respond({ error: 'Request is too large.' }, 400);
      let body;
      try { body = JSON.parse(raw); } catch { return respond({ error: 'Invalid request.' }, 400); }
      if (!body || !requestPattern.test(body.request_id || '')) return respond({ error: 'Invalid request identifier.' }, 400);

      if (body.action === 'status') {
        if (!sessionPattern.test(body.session_id || '')) return respond({ error: 'Invalid payment session.' }, 400);
        const session = await stripe('/checkout/sessions/' + encodeURIComponent(body.session_id));
        const metadata = session.metadata || {};
        if (metadata.puco_shop !== 'v1' || metadata.request_id !== body.request_id || metadata.site_origin !== origin) return respond({ error: 'Payment session not found.' }, 404);
        let items;
        try { items = validItems(JSON.parse(metadata.items || '')); } catch { items = null; }
        const subtotal = items?.reduce((sum, line) => sum + productMap.get(line.id).priceCents * line.quantity, 0);
        if (!items || session.currency !== currency || session.amount_subtotal !== subtotal) return respond({ error: 'Payment details do not match.' }, 409);
        return respond({ paid: session.payment_status === 'paid' && session.status === 'complete' });
      }
      const items = validItems(body.items);
      if (body.action !== 'create' || !items || !['cart', 'buy'].includes(body.source)) return respond({ error: 'Invalid cart.' }, 400);
      const params = new URLSearchParams({
        mode: 'payment', success_url: `${origin}/shop/?checkout=return&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/shop/?checkout=cancel`,
        'metadata[puco_shop]': 'v1', 'metadata[request_id]': body.request_id,
        'metadata[site_origin]': origin, 'metadata[source]': body.source, 'metadata[items]': JSON.stringify(items)
      });
      // Prices come from the server catalogue. Client totals and price IDs are ignored.
      for (const [index, line] of items.entries()) {
        const product = productMap.get(line.id);
        const priceId = Deno.env.get(product.priceSecret);
        if (!/^price_[A-Za-z0-9]+$/.test(priceId || '')) return respond({ error: 'Product price is not configured.' }, 503);
        const price = await stripe('/prices/' + encodeURIComponent(priceId));
        if (!price.active || price.type !== 'one_time' || price.currency !== currency || price.unit_amount !== product.priceCents) return respond({ error: 'Product price is not available.' }, 503);
        params.set(`line_items[${index}][price]`, priceId);
        params.set(`line_items[${index}][quantity]`, String(line.quantity));
      }
      const countries = (Deno.env.get('SHOP_SHIPPING_COUNTRIES') || '').split(',').map((value) => value.trim().toUpperCase()).filter((value) => /^[A-Z]{2}$/.test(value));
      countries.forEach((country, index) => params.set(`shipping_address_collection[allowed_countries][${index}]`, country));
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${body.request_id}|${origin}|${body.source}|${JSON.stringify(items)}`));
      const key = 'puco-shop-' + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const session = await stripe('/checkout/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': key }, body: params
      });
      if (!session.url || !sessionPattern.test(session.id || '')) throw new Error('Payment service unavailable');
      return respond({ url: session.url, session_id: session.id });
    } catch {
      return respond({ error: 'Payment service is temporarily unavailable. Please try again.' }, 503);
    }
  };
}
Deno.serve(createShopHandler());
