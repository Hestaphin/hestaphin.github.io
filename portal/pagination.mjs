export const PORTAL_PAGE_SIZES = [20, 50, 100];
const portalPagers = new Map();
const pagerText = value => globalThis.window?.COPKU_I18N?.translate(value) || value;
export function createPager(key, storage = globalThis.localStorage) {
  let page = 0, size = 20;
  try { const saved = Number(storage?.getItem('copku-page-size-' + key.split(':')[0])); if (PORTAL_PAGE_SIZES.includes(saved)) size = saved; } catch {}
  return {
    get page() { return page; }, get size() { return size; },
    reset() { page = 0; },
    setPage(value) { page = Math.max(0, Math.floor(Number(value) || 0)); },
    setSize(value) { if (PORTAL_PAGE_SIZES.includes(Number(value))) { size = Number(value); page = 0; try { storage?.setItem('copku-page-size-' + key.split(':')[0], String(size)); } catch {} } },
    bounds(total) { const pages = Math.max(1, Math.ceil(total / size)); page = Math.min(page, pages - 1); return { page, size, pages, total, start: page * size, end: Math.min(total, (page + 1) * size) }; },
    slice(items) { const b = this.bounds(items.length); return items.slice(b.start, b.end); },
    html(total) {
      const b = this.bounds(total), t = pagerText;
      return `<nav class="portal-pagination" aria-label="${t('List pages')}"><label>${t('Items per page')} <select data-page-size aria-label="${t('Items per page')}">${PORTAL_PAGE_SIZES.map(n => `<option value="${n}"${n === size ? ' selected' : ''}>${n}</option>`).join('')}</select></label><span class="pagination-range" aria-live="polite">${total ? b.start + 1 : 0}–${b.end} <span>${t('of')}</span> ${total}</span><div class="pagination-navigation"><button type="button" data-page-to="0" aria-label="${t('First page')}"${page ? '' : ' disabled'}>«</button><button type="button" data-page-to="${page - 1}" aria-label="${t('Previous page')}"${page ? '' : ' disabled'}>‹</button><label>${t('Page')} <input data-page-number type="number" min="1" max="${b.pages}" value="${page + 1}" aria-label="${t('Page number')}"> / ${b.pages}</label><button type="button" data-page-to="${page + 1}" aria-label="${t('Next page')}"${page < b.pages - 1 ? '' : ' disabled'}>›</button><button type="button" data-page-to="${b.pages - 1}" aria-label="${t('Last page')}"${page < b.pages - 1 ? '' : ' disabled'}>»</button></div></nav>`;
    },
    bind(container, render) {
      for (const button of container.querySelectorAll('[data-page-to]')) button.onclick = () => { this.setPage(button.dataset.pageTo); render(); };
      for (const select of container.querySelectorAll('[data-page-size]')) select.onchange = event => { this.setSize(event.target.value); render(); };
      for (const input of container.querySelectorAll('[data-page-number]')) input.onchange = event => { this.setPage(Number(event.target.value) - 1); render(); };
    }
  };
}
export function portalPager(key) { if (!portalPagers.has(key)) portalPagers.set(key, createPager(key)); return portalPagers.get(key); }
// Read every authorized row, including records beyond the Data API's row cap.
// Each factory returns a fresh, deterministically ordered query.
export async function readAllRows(factory, batchSize = 500) {
  const rows = [];
  for (let offset = 0; ; offset += batchSize) {
    const response = await factory().range(offset, offset + batchSize - 1);
    if (response.error) throw response.error;
    const next = response.data || []; rows.push(...next);
    if (next.length < batchSize) return rows;
  }
}
