import { productById } from './shop-data.mjs';

export const CART_KEY = 'puco-shop-cart-v1';
export const SELECTION_KEY = 'puco-shop-selection-v1';
export const PENDING_KEY = 'puco-shop-checkout-v1';
export const MAX_QUANTITY = 99;

export function normalizeCart(value) {
  if (!Array.isArray(value)) return [];
  const quantities = new Map();
  for (const line of value) {
    if (!line || !productById(line.id) || !Number.isInteger(line.quantity) || line.quantity < 1) continue;
    quantities.set(line.id, Math.min(MAX_QUANTITY, (quantities.get(line.id) || 0) + line.quantity));
  }
  return [...quantities].map(([id, quantity]) => ({ id, quantity }));
}

export function readCart(raw) {
  try {
    const value = JSON.parse(raw);
    return value?.version === 1 ? normalizeCart(value.items) : [];
  } catch { return []; }
}

export function writeCart(items) {
  return JSON.stringify({ version: 1, items: normalizeCart(items) });
}

export function setQuantity(items, id, quantity) {
  const cart = normalizeCart(items);
  if (!productById(id) || !Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) return cart;
  if (!quantity) return cart.filter((line) => line.id !== id);
  if (cart.some((line) => line.id === id)) return cart.map((line) => line.id === id ? { id, quantity } : line);
  return [...cart, { id, quantity }];
}

export function readSelection(raw, items) {
  const ids = normalizeCart(items).map((line) => line.id);
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value) && value.every((id) => typeof id === 'string')) return ids.filter((id) => value.includes(id));
  } catch { /* Existing carts start with every item selected. */ }
  return ids;
}

export function selectedItems(items, selection) {
  const ids = new Set(selection);
  return normalizeCart(items).filter((line) => ids.has(line.id));
}

export function addProduct(items, id) {
  const cart = normalizeCart(items);
  return setQuantity(cart, id, Math.min(MAX_QUANTITY, (cart.find((line) => line.id === id)?.quantity || 0) + 1));
}

export function cartSummary(items) {
  const lines = normalizeCart(items).map((line) => ({ ...line, product: productById(line.id), totalCents: productById(line.id).priceCents * line.quantity }));
  return { lines, count: lines.reduce((sum, line) => sum + line.quantity, 0), subtotalCents: lines.reduce((sum, line) => sum + line.totalCents, 0) };
}

// A paid checkout removes only its own snapshot. Later additions remain in cart.
export function subtractPurchased(items, purchased) {
  const quantities = new Map(normalizeCart(purchased).map((line) => [line.id, line.quantity]));
  return normalizeCart(normalizeCart(items).map((line) => ({ ...line, quantity: Math.max(0, line.quantity - (quantities.get(line.id) || 0)) })));
}

export function trustedCheckoutUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
