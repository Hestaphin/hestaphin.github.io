import { formatPrice } from './shop-data.mjs';

export function cartIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 40 32');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M2 3h5l5 20h20l6-17H8M12 23l-2 4h22');
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.3');
  svg.append(path);
  for (const x of [14, 30]) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x); circle.setAttribute('cy', '29'); circle.setAttribute('r', '2.6'); circle.setAttribute('fill', 'currentColor');
    svg.append(circle);
  }
  return svg;
}

export function productCard(product) {
  const article = document.createElement('article');
  // The shared search controller uses this marker to preserve reading position.
  article.className = 'shop-product-card archive-card'; article.dataset.event = product.id;
  const link = document.createElement('a'); link.className = 'shop-product-image'; link.href = product.url;
  link.setAttribute('aria-label', `${product.title}: see product details`);
  const image = document.createElement('img'); image.src = product.image; image.alt = product.imageAlt;
  image.width = product.imageWidth; image.height = product.imageHeight;
  link.append(image);
  const heading = document.createElement('h2'); heading.className = 'shop-product-title';
  const titleLink = document.createElement('a'); titleLink.href = product.url; titleLink.textContent = product.title; heading.append(titleLink);
  const bottom = document.createElement('div'); bottom.className = 'shop-product-bottom';
  const price = document.createElement('p'); price.className = 'shop-price'; price.textContent = formatPrice(product.priceCents);
  const actions = document.createElement('div'); actions.className = 'shop-product-actions';
  const buy = document.createElement('button'); buy.type = 'button'; buy.className = 'shop-button'; buy.dataset.buy = product.id; buy.textContent = 'Buy';
  buy.setAttribute('aria-label', `Buy ${product.title}`);
  const add = document.createElement('button'); add.type = 'button'; add.className = 'shop-button shop-icon-button'; add.dataset.add = product.id;
  add.setAttribute('aria-label', `Add ${product.title} to shopping cart`); add.title = 'Add to shopping cart'; add.append(cartIcon());
  actions.append(buy, add); bottom.append(price, actions); article.append(link, heading, bottom);
  return article;
}
