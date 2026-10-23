import { productById, formatPrice } from './shop-data.mjs?v=1.23';
import { CART_KEY, SELECTION_KEY, PENDING_KEY, MAX_QUANTITY, normalizeCart, readCart, writeCart, readSelection, selectedItems, addProduct, setQuantity, cartSummary, subtractPurchased, trustedCheckoutUrl } from './shop-model.mjs';
import { invokeShopCheckout } from './shop-checkout.mjs?v=1.23';

const $ = (selector) => document.querySelector(selector);
const cartDialog = $('#shop-cart');
const checkoutDialog = $('#shop-checkout');
const payButton = $('#shop-pay');
let cart = readCart(storageGet('localStorage', CART_KEY));
let selection = new Set(readSelection(storageGet('localStorage', SELECTION_KEY), cart));
let checkoutItems = [];
let checkoutSource = 'cart';
let lastRequest = null;
let busy = false;
let statusTimer;

function storageGet(kind, key) { try { return window[kind].getItem(key); } catch { return null; } }
function storageSet(kind, key, value) { try { window[kind].setItem(key, value); } catch { /* The cart still works in memory. */ } }
function storageRemove(kind, key) { try { window[kind].removeItem(key); } catch { /* Storage can be unavailable in private browsing. */ } }
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function announce(message) {
  clearTimeout(statusTimer);
  const status = $('#shop-status'); status.textContent = message; status.hidden = false;
  statusTimer = setTimeout(() => { status.hidden = true; }, 4500);
}
function openDialog(dialog) {
  if (cartDialog.open) cartDialog.close();
  if (checkoutDialog.open) checkoutDialog.close();
  dialog.showModal(); document.body.classList.toggle('has-shop-dialog', true);
}
function saveSelection() { storageSet('localStorage', SELECTION_KEY, JSON.stringify([...selection])); }
function updateCart(items, select = []) {
  const previousIds = new Set(cart.map((line) => line.id));
  cart = normalizeCart(items);
  selection = new Set(cart.filter((line) => selection.has(line.id) || !previousIds.has(line.id) || select.includes(line.id)).map((line) => line.id));
  storageSet('localStorage', CART_KEY, writeCart(cart)); saveSelection(); renderCart();
}
function renderCart() {
  const summary = cartSummary(cart);
  const selected = cartSummary(selectedItems(cart, selection));
  $('#shop-cart-count').textContent = summary.count ? String(summary.count) : '';
  $('#open-shop-cart').setAttribute('aria-label', `Shopping cart, ${summary.count} ${summary.count === 1 ? 'item' : 'items'}`);
  $('#shop-cart-items').replaceChildren(...summary.lines.map((line) => cartLine(line, 'cart')));
  $('#shop-cart-empty').hidden = summary.count > 0;
  $('#shop-cart-subtotal').textContent = formatPrice(summary.subtotalCents);
  $('#shop-cart-selected-subtotal').textContent = formatPrice(selected.subtotalCents);
  $('#shop-cart-selection-count').textContent = `${selected.count} of ${summary.count} items selected`;
  $('#shop-select-all').checked = summary.lines.length > 0 && selection.size === summary.lines.length;
  $('#shop-select-all').indeterminate = selection.size > 0 && selection.size < summary.lines.length;
  $('#shop-select-all').disabled = summary.count === 0;
  $('#shop-remove-all').disabled = summary.count === 0;
  $('#shop-cart-checkout').disabled = selected.count === 0;
}
function quantityControl(line, mode) {
  const controls = node('div', 'shop-line-controls');
  const label = node('label', '', 'Quantity');
  const stepper = node('span', 'shop-quantity-stepper');
  const input = node('input'); input.type = 'number'; input.min = '1'; input.max = String(MAX_QUANTITY); input.step = '1'; input.value = line.quantity;
  const marker = mode === 'cart' ? 'quantity' : 'checkoutQuantity';
  input.dataset[marker] = line.id; input.setAttribute('aria-label', `Quantity for ${line.product.title}`);
  input.disabled = busy;
  function changeQuantity(quantity) {
    if (busy) return;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      input.value = line.quantity; announce(`Choose a quantity from 1 to ${MAX_QUANTITY}.`); return;
    }
    if (mode === 'cart') updateCart(setQuantity(cart, line.id, quantity));
    else {
      checkoutItems = setQuantity(checkoutItems, line.id, quantity);
      if (checkoutSource === 'cart') updateCart(setQuantity(cart, line.id, quantity));
      renderCheckout();
    }
    const attribute = mode === 'cart' ? 'data-quantity' : 'data-checkout-quantity';
    $(`[${attribute}="${line.id}"]`)?.focus({ preventScroll: true });
  }
  input.addEventListener('change', () => changeQuantity(String(input.value).trim() ? Number(input.value) : NaN));
  const decrease = node('button', 'shop-quantity-button', '−'); decrease.type = 'button'; decrease.disabled = busy || line.quantity <= 1;
  decrease.setAttribute('aria-label', `Decrease quantity for ${line.product.title}`); decrease.addEventListener('click', () => changeQuantity(line.quantity - 1));
  const increase = node('button', 'shop-quantity-button', '+'); increase.type = 'button'; increase.disabled = busy || line.quantity >= MAX_QUANTITY;
  increase.setAttribute('aria-label', `Increase quantity for ${line.product.title}`); increase.addEventListener('click', () => changeQuantity(line.quantity + 1));
  stepper.append(decrease, input, increase); label.append(stepper); controls.append(label);
  return controls;
}
function cartLine(line, mode) {
  const article = node('article', 'shop-cart-line');
  if (mode === 'cart') {
    article.className += ' is-selectable';
    const checkbox = node('input', 'shop-select-input'); checkbox.type = 'checkbox'; checkbox.checked = selection.has(line.id); checkbox.dataset.select = line.id;
    checkbox.setAttribute('aria-label', `Select ${line.product.title} for checkout`);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selection.add(line.id); else selection.delete(line.id);
      saveSelection(); renderCart(); $(`[data-select="${line.id}"]`)?.focus({ preventScroll: true });
    });
    article.append(checkbox);
  }
  const image = node('img'); image.src = line.product.image; image.alt = line.product.imageAlt; image.width = 64; image.height = 84;
  const copy = node('div');
  const title = node('a', 'shop-line-title', line.product.title); title.href = line.product.url;
  copy.append(title, node('p', '', `${formatPrice(line.product.priceCents)} × ${line.quantity} = ${formatPrice(line.totalCents)}`));
  const controls = quantityControl(line, mode);
  if (mode === 'cart') {
    const remove = node('button', 'shop-remove', 'Remove'); remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${line.product.title} from cart`);
    remove.addEventListener('click', () => { updateCart(setQuantity(cart, line.id, 0)); $('#shop-cart-checkout').disabled ? $('#close-shop-cart').focus() : $('#shop-cart-checkout').focus(); });
    controls.append(remove);
  }
  copy.append(controls);
  article.append(image, copy); return article;
}
function renderCheckout() {
  const summary = cartSummary(checkoutItems);
  $('#shop-checkout-items').replaceChildren(...summary.lines.map((line) => cartLine(line, 'checkout')));
  $('#shop-checkout-subtotal').textContent = formatPrice(summary.subtotalCents);
}
function showCheckout(items, source) {
  if (busy) return;
  checkoutItems = normalizeCart(items); checkoutSource = source;
  if (!checkoutItems.length) return;
  $('#shop-checkout-title').textContent = 'Checkout';
  renderCheckout();
  $('#shop-checkout-total').hidden = false;
  $('#shop-checkout-note').hidden = false;
  $('#shop-checkout-error').hidden = true;
  payButton.hidden = false; $('#shop-verify-payment').hidden = true;
  openDialog(checkoutDialog);
}
function checkoutError(message) {
  const box = $('#shop-checkout-error'); box.replaceChildren(document.createTextNode(message + ' '));
  const contact = node('a', 'shop-error-contact', 'Contact us'); contact.href = '/contact/'; box.append(contact); box.hidden = false;
}
function pendingCheckout() {
  try {
    const value = JSON.parse(storageGet('sessionStorage', PENDING_KEY));
    if (!value || !/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(value.sessionId) || !/^[a-f0-9-]{36}$/i.test(value.requestId) || !['cart', 'buy'].includes(value.source)) return null;
    return { ...value, items: normalizeCart(value.items) };
  } catch { return null; }
}
function uuid() {
  return crypto.randomUUID();
}

$('#open-shop-cart').addEventListener('click', () => { renderCart(); openDialog(cartDialog); });
$('#close-shop-cart').addEventListener('click', () => cartDialog.close());
$('#continue-shopping').addEventListener('click', () => cartDialog.close());
$('#close-shop-checkout').addEventListener('click', () => checkoutDialog.close());
$('#checkout-back').addEventListener('click', () => checkoutDialog.close());
$('#shop-cart-checkout').addEventListener('click', () => showCheckout(selectedItems(cart, selection), 'cart'));
$('#shop-remove-all').addEventListener('click', () => { updateCart([]); announce('Shopping cart cleared.'); $('#close-shop-cart').focus({ preventScroll: true }); });
$('#shop-select-all').addEventListener('change', (event) => {
  selection = new Set(event.target.checked ? cart.map((line) => line.id) : []); saveSelection(); renderCart();
});
for (const dialog of [cartDialog, checkoutDialog]) {
  dialog.addEventListener('close', () => {
    document.body.classList.toggle('has-shop-dialog', cartDialog.open || checkoutDialog.open);
    if (!cartDialog.open && !checkoutDialog.open) $('#open-shop-cart').focus({ preventScroll: true });
  });
}
document.addEventListener('click', (event) => {
  const add = event.target.closest('[data-add]');
  const buy = event.target.closest('[data-buy]');
  if (add && productById(add.dataset.add)) {
    const count = cart.find((line) => line.id === add.dataset.add)?.quantity || 0;
    if (count === MAX_QUANTITY) { announce(`The maximum quantity is ${MAX_QUANTITY}.`); return; }
    updateCart(addProduct(cart, add.dataset.add), [add.dataset.add]); announce(`${productById(add.dataset.add).title} added to cart.`);
  } else if (buy && productById(buy.dataset.buy)) showCheckout([{ id: buy.dataset.buy, quantity: 1 }], 'buy');
});
window.addEventListener('storage', (event) => {
  if (event.key === CART_KEY || event.key === SELECTION_KEY || event.key === null) {
    cart = readCart(storageGet('localStorage', CART_KEY)); selection = new Set(readSelection(storageGet('localStorage', SELECTION_KEY), cart)); renderCart();
  }
});

payButton.addEventListener('click', async () => {
  if (busy || !checkoutItems.length) return;
  busy = true; payButton.disabled = true; payButton.textContent = 'Preparing payment…';
  renderCheckout();
  $('#shop-checkout-error').hidden = true;
  try {
    const submittedItems = normalizeCart(checkoutItems);
    const submittedSource = checkoutSource;
    const signature = JSON.stringify({ items: submittedItems, source: submittedSource });
    if (!lastRequest || lastRequest.signature !== signature) lastRequest = { signature, requestId: uuid() };
    const result = await invokeShopCheckout({ action: 'create', items: submittedItems, source: submittedSource, request_id: lastRequest.requestId });
    if (!checkoutDialog.open) return;
    const url = trustedCheckoutUrl(result.url);
    if (!url || !/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(result.session_id)) throw new Error('The payment link could not be opened. Please try again.');
    storageSet('sessionStorage', PENDING_KEY, JSON.stringify({ sessionId: result.session_id, requestId: lastRequest.requestId, items: submittedItems, source: submittedSource }));
    window.location.assign(url);
  } catch (error) { if (['CHECKOUT_ENDED','CHECKOUT_CHANGED'].includes(error.code)) lastRequest = null; checkoutError(error.message); }
  finally { busy = false; payButton.disabled = false; payButton.textContent = 'Continue to payment'; if (!payButton.hidden) renderCheckout(); }
});

async function verifyReturn() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  const pending = pendingCheckout();
  $('#shop-checkout-title').textContent = 'Payment status';
  $('#shop-checkout-items').replaceChildren(); $('#shop-checkout-total').hidden = true;
  $('#shop-checkout-note').hidden = true; payButton.hidden = true;
  $('#shop-verify-payment').hidden = true; $('#shop-checkout-error').hidden = true;
  openDialog(checkoutDialog);
  if (!pending || sessionId !== pending.sessionId) {
    checkoutError('Payment could not be verified in this browser. Please check your Stripe receipt or contact us.'); return;
  }
  $('#shop-checkout-items').append(node('p', '', 'Checking your payment…'));
  try {
    const result = await invokeShopCheckout({ action: 'status', session_id: sessionId, request_id: pending.requestId });
    if (result.paid !== true) throw new Error('Your payment has not been confirmed yet. You can check again in a moment.');
    if (pending.source === 'cart') updateCart(subtractPurchased(cart, pending.items));
    storageRemove('sessionStorage', PENDING_KEY);
    $('#shop-checkout-items').replaceChildren(node('p', '', 'Payment confirmed. Thank you for your purchase. The orchestra will arrange delivery using your checkout contact details.'));
    const url = new URL(window.location.href); url.searchParams.delete('checkout'); url.searchParams.delete('session_id');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch (error) {
    $('#shop-checkout-items').replaceChildren(); checkoutError(error.message); $('#shop-verify-payment').hidden = false;
  }
}
$('#shop-verify-payment').addEventListener('click', verifyReturn);
renderCart();
const params = new URLSearchParams(window.location.search);
if (params.get('checkout') === 'return') verifyReturn();
else if (params.get('checkout') === 'cancel') {
  announce('Payment was cancelled. Your cart has been kept.');
  const url = new URL(window.location.href); url.searchParams.delete('checkout'); history.replaceState(null, '', url.pathname + url.search + url.hash);
}
