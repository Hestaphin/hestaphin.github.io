export const CHECKOUT_UNAVAILABLE = 'Online checkout is not available yet. Please contact us to purchase.';

export async function invokeShopCheckout(body, options = {}) {
  const config = options.config ?? window;
  if (!config.PUCO_SHOP_CHECKOUT_ENABLED || !config.PUCO_SUPABASE_URL || !config.PUCO_SUPABASE_ANON_KEY) throw new Error(CHECKOUT_UNAVAILABLE);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await (options.fetch ?? fetch)(`${config.PUCO_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/create-shop-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.PUCO_SUPABASE_ANON_KEY },
      body: JSON.stringify(body), signal: controller.signal
    });
    const data = await response.json();
    if (!response.ok || data.error) { const error = new Error(data.error || CHECKOUT_UNAVAILABLE); error.code = data.code; throw error; }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The payment service took too long to respond. Please try again.');
    if (error.code) throw error;
    throw new Error(CHECKOUT_UNAVAILABLE);
  } finally { clearTimeout(timeout); }
}
