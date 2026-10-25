import { events as concertEvents } from './events-data.mjs?v=1.30';
import { activities } from '../about/about-data.mjs';
import { lessons } from '../learn/learn-data.mjs?v=1.30';
import { opportunityActivities, pathways } from '../opportunities/opportunities-data.mjs?v=1.30';
import { opportunityCategories, opportunityCategoryURL, opportunityCategoryFromLocation, legacyOpportunityCategory } from '../opportunities/opportunities-routes.mjs?v=1.30';
import { products } from '../shop/shop-data.mjs';
import { productCard } from '../shop/shop-render.mjs';
import { seasons, latestSelectableYear, validateFilters, filterEvents, filterActivityCategory, sortEvents, groupByMonth, formatEventDate, createViewState, reduceView } from './events-model.mjs';

const $ = (selector) => document.querySelector(selector);
const body = document.body;
const aboutPage = body.classList.contains('about-page');
const learnPage = body.classList.contains('learn-page');
const opportunitiesPage = body.classList.contains('opportunities-page');
const shopPage = body.classList.contains('shop-page');
const sourceRecords = aboutPage ? activities : learnPage ? lessons : opportunitiesPage ? opportunityActivities : shopPage ? products : concertEvents;
const events = sourceRecords.filter((record) => !body.dataset.project || record.project === body.dataset.project);
const contentName = shopPage ? 'products' : learnPage ? 'learning entries' : aboutPage || opportunitiesPage ? 'activities' : 'events';
const panel = $('#event-filter-panel');
const openButton = $('#open-event-search');
const closeButton = $('#close-event-search');
const form = $('#event-filter-form');
const keyword = $('#event-keyword');
const yearCurrent = $('#year-current');
const yearText = $('#year-current-text');
const yearEntry = $('#year-entry');
const yearPrevious = $('#year-previous');
const yearNext = $('#year-next');
const errorBox = $('#event-filter-error');
const searchButton = $('#event-search-submit');
const normalView = $('#normal-events');
const resultsView = $('#event-results');
const resultsHeading = $('#results-heading');
const resultsList = $('#event-result-groups');
const oldestFirst = $('#events-oldest-first');
const orderLabel = $('#event-order-label');
const categoryArea = $('[data-activity-categories]');
const categoryLinks = [...(categoryArea?.querySelectorAll('[data-activity-category]') ?? [])];
function categoryFromLocation() {
  if (categoryArea && opportunitiesPage) return opportunityCategoryFromLocation(window.location.pathname, window.location.hash);
  if (categoryArea && window.location.hash === '#upcoming-events') return 'upcoming';
  return categoryLinks.find((link) => link.getAttribute('href') === window.location.hash)?.dataset.activityCategory || 'all';
}
let selectedCategory = categoryFromLocation();
let view = createViewState();
const datedYears = events.filter((event) => event.date).map((event) => Number(event.date.slice(0, 4)));
let selectedYear = learnPage || opportunitiesPage || shopPage ? null : Math.min(latestSelectableYear(), datedYears.length ? Math.max(...datedYears) : new Date().getFullYear());
let editingYear = false;
let indexedEvents = events;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function eventCard(event, lazy = true, includeAnchor = false) {
  if (shopPage) return productCard(event);
  const article = element('article', 'archive-card');
  article.dataset.event = event.id;
  if (includeAnchor && event.legacyAnchor) article.id = event.legacyAnchor;
  const link = element('a', 'archive-image');
  link.href = event.url;
  link.setAttribute('aria-label', `${event.title}: see detail`);
  const image = element('img');
  image.src = event.image;
  image.alt = event.imageAlt;
  image.width = event.imageWidth ?? (aboutPage ? 1307 : 1680);
  image.height = event.imageHeight ?? (aboutPage ? 499 : 937);
  if (lazy) image.loading = 'lazy';
  link.append(image);
  const copy = element('div', 'archive-copy');
  const date = element(event.date ? 'time' : 'p', 'event-date', event.dateLabel || (learnPage && !event.date ? event.title : formatEventDate(event.date)));
  if (event.date) date.dateTime = event.date;
  const paragraphs = element('div', 'archive-paragraphs');
  event.paragraphs.forEach((paragraph) => paragraphs.append(element('p', '', paragraph)));
  const bottom = element('div', 'archive-bottom');
  const heading = element('h3', 'archive-label', event.label);
  const title = element('span', 'visually-hidden', `${event.label ? ': ' : ''}${event.title}`);
  heading.append(title);
  if (!event.label) heading.className = 'visually-hidden';
  const detailLabel = event.detailLabel || 'See detail';
  const detail = element('a', 'archive-detail', detailLabel);
  detail.href = event.url;
  detail.setAttribute('aria-label', `${detailLabel}: ${event.title}`);
  bottom.append(heading, detail);
  copy.append(date, paragraphs, bottom);
  article.append(link, copy);
  return article;
}

function categoryRecords(records) {
  return categoryArea ? filterActivityCategory(records, selectedCategory) : records;
}

function renderCategoryIntroduction() {
  const intro = $('#opportunity-category-intro');
  if (!intro) return;
  if (selectedCategory === 'all') {
    intro.replaceChildren(...[
      'Become a member of the orchestra to unlock more potential',
      'We always hold some activities',
      "Classic lover's place"
    ].map((text) => element('p', '', text)));
    return;
  }
  const pathway = pathways.find((item) => item.id === selectedCategory);
  const category = opportunityCategories.find((item) => item.id === selectedCategory);
  const heading = element('h2', 'activity-category-title', category.title);
  intro.replaceChildren(heading, ...(pathway?.description || []).map((text) => element('p', '', text)));
  if (pathway) {
    const action = element('a', 'opportunity-detail-action', pathway.action.title);
    action.href = pathway.action.url;
    intro.append(action);
  }
}

function renderNormalEvents() {
  if (body.dataset.activity) return;
  const records = categoryRecords(events);
  const list = $('#normal-event-list');
  list.replaceChildren(...sortEvents(records).map((event) => eventCard(event, true, true)));
  if (!records.length) {
    const message = selectedCategory === 'wind-band' ? 'No activities have been posted for the wind band yet.'
      : selectedCategory === 'upcoming' ? 'No upcoming events have been announced yet.'
      : selectedCategory === 'past' ? 'No past events have been posted yet.'
      : learnPage ? 'No learning entries have been posted for this topic yet.' : 'No activities have been posted for this project yet.';
    list.append(element('p', 'project-empty', message));
  }
  if (categoryArea) {
    categoryLinks.forEach((link) => {
      if (link.dataset.activityCategory === selectedCategory) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const selected = categoryLinks.find((link) => link.dataset.activityCategory === selectedCategory);
    list.setAttribute('aria-label', selectedCategory === 'all' ? `All ${contentName}` : `${selected.textContent.trim()} ${contentName}`);
    const countLabel = records.length === 1 ? (opportunitiesPage ? 'activity' : 'event') : contentName;
    $('#activity-category-status').textContent = `${selected.textContent.trim()}: ${records.length} ${countLabel}.`;
    renderCategoryIntroduction();
    const clubRegistration = $('#club-membership');
    if (clubRegistration) clubRegistration.hidden = selectedCategory !== 'club';
    if (opportunitiesPage) {
      body.dataset.opportunityCategory = selectedCategory;
      const category = opportunityCategories.find((item) => item.id === selectedCategory);
      document.title = `${category ? category.title + ' | ' : ''}Opportunities | Peking Unnamed Chamber Orchestra`;
      document.querySelectorAll('#navigation-opportunities-submenu a').forEach((link) => {
        if (category && link.getAttribute('href') === category.url) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    } else {
      const hash = selectedCategory === 'upcoming' ? '#ongoing-events' : selectedCategory === 'past' ? '#past-events' : null;
      document.querySelectorAll('#navigation-events-submenu a').forEach((link) => {
        if (hash && link.getAttribute('href').endsWith(hash)) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }
  }
}

function scrollToCategory(smooth = false, focus = false) {
  const barsBottom = $('.section-navigation')?.getBoundingClientRect().bottom ?? 0;
  const top = window.scrollY + categoryArea.getBoundingClientRect().top - barsBottom;
  window.scrollTo({ top: Math.max(0, top), behavior: smooth && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'smooth' : 'instant' });
  if (focus) categoryArea.focus({ preventScroll: true });
}

function canonicalizeOpportunityURL() {
  if (opportunitiesPage && legacyOpportunityCategory(window.location.hash) !== undefined) {
    window.history.replaceState(null, '', opportunityCategoryURL(selectedCategory) + (window.location.search || ''));
  }
}

if (categoryArea) {
  document.querySelectorAll('[data-activity-category]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      selectedCategory = link.dataset.activityCategory;
      finishYearEdit(true);
      dispatch({ type: 'CLOSE' });
      showError();
      renderNormalEvents();
      const destination = link.getAttribute('href');
      const current = opportunitiesPage ? window.location.pathname + window.location.hash : window.location.hash;
      if (current !== destination) window.history.pushState(null, '', destination);
      scrollToCategory(true, true);
    });
  });
  function restoreCategory() {
    selectedCategory = categoryFromLocation();
    canonicalizeOpportunityURL();
    finishYearEdit(true);
    dispatch({ type: 'CLOSE' });
    showError();
    renderNormalEvents();
    if (opportunitiesPage ? selectedCategory !== 'all' && !window.location.hash : window.location.hash === '#upcoming-events' || categoryLinks.some((link) => link.getAttribute('href') === window.location.hash)) scrollToCategory();
  }
  window.addEventListener('hashchange', restoreCategory);
  if (opportunitiesPage) window.addEventListener('popstate', restoreCategory);
}

function applyView() {
  body.classList.toggle('is-filter-open', view.panelOpen);
  body.classList.toggle('is-search-mode', view.mode === 'results');
  panel.inert = !view.panelOpen;
  panel.setAttribute('aria-hidden', String(!view.panelOpen));
  openButton.hidden = view.panelOpen;
  openButton.setAttribute('aria-expanded', String(view.panelOpen));
  normalView.hidden = view.mode === 'results';
  resultsView.hidden = view.mode !== 'results';
  resultsView.setAttribute('aria-busy', String(view.loading));
  searchButton.disabled = view.loading;
  searchButton.textContent = view.loading ? 'SEARCHING…' : 'SEARCH';
}

function dispatch(action) {
  view = reduceView(view, action);
  applyView();
}

function renderResults() {
  const sorted = sortEvents(view.results, !oldestFirst.checked);
  const count = sorted.length;
  resultsHeading.replaceChildren(
    document.createTextNode(`${count} `),
    element('strong', '', count === 1 ? 'Result' : 'Results'),
    document.createTextNode(count === 1 ? ' was found' : ' were found')
  );
  resultsList.replaceChildren();
  if (!count) {
    resultsList.append(element('p', 'results-empty', `No ${contentName} match these filters. Try another year, season, or month range.`));
  }
  for (const group of groupByMonth(sorted)) {
    const section = element('section', 'event-month-group');
    const heading = element('h3', '', shopPage && group.key === 'undated' ? 'Products' : group.key === 'undated' && opportunitiesPage ? 'Activities by season and period' : learnPage && group.key === 'undated' ? 'Undated learning entries' : group.label);
    section.append(heading, ...group.events.map((event) => eventCard(event)));
    resultsList.append(section);
  }
  orderLabel.textContent = 'Order from oldest to newest';
}

function showError(message = '') {
  errorBox.hidden = !message;
  errorBox.textContent = message;
}

function updateYear() {
  const maximum = latestSelectableYear();
  if (selectedYear !== null) selectedYear = Math.min(maximum, selectedYear);
  const centre = selectedYear ?? new Date().getFullYear();
  yearText.textContent = selectedYear === null ? 'All years' : String(selectedYear);
  yearCurrent.setAttribute('aria-label', selectedYear === null ? 'All years. Click to enter a year.' : `Selected year ${selectedYear}. Click to edit.`);
  yearPrevious.disabled = centre <= 1;
  yearNext.disabled = centre >= maximum;
  yearPrevious.textContent = yearPrevious.disabled ? '' : String(centre - 1);
  yearNext.textContent = yearNext.disabled ? '' : String(centre + 1);
  yearPrevious.setAttribute('aria-label', yearPrevious.disabled ? 'No earlier year available' : `Select year ${yearPrevious.textContent}`);
  yearNext.setAttribute('aria-label', yearNext.disabled ? 'No later year available' : `Select year ${yearNext.textContent}`);
  yearPrevious.setAttribute('aria-hidden', String(yearPrevious.disabled));
  yearNext.setAttribute('aria-hidden', String(yearNext.disabled));
  yearEntry.title = `Past years through ${maximum}`;
  yearEntry.value = selectedYear === null ? '' : String(selectedYear);
}

function finishYearEdit(cancel = false) {
  if (!editingYear) return true;
  const raw = yearEntry.value.trim();
  const parsed = raw === '' ? null : /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
  const message = validateFilters({ year: parsed, from: '', to: '' });
  if (!cancel && message) {
    showError(message);
    yearEntry.setAttribute('aria-invalid', 'true');
    return false;
  }
  if (!cancel) selectedYear = parsed;
  editingYear = false;
  yearEntry.hidden = true;
  yearEntry.removeAttribute('aria-invalid');
  yearCurrent.hidden = false;
  showError();
  updateYear();
  return true;
}

function chooseYear(year) {
  finishYearEdit(true);
  selectedYear = year === null ? null : Math.min(latestSelectableYear(), Math.max(1, year));
  updateYear();
  showError();
}

function readFilters() {
  return {
    keyword: keyword.value,
    year: selectedYear,
    seasons: [...form.querySelectorAll('[data-season][aria-pressed="true"]')].map((button) => button.dataset.season),
    from: $('#event-from-month').value,
    to: $('#event-to-month').value
  };
}

// Index the body of each actual event subpage. Header/footer text is deliberately excluded.
// Page metadata and excerpts remain searchable if a detail page cannot be fetched.
const indexReady = Promise.all(events.map(async (event) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(event.url, { signal: controller.signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error('Event detail unavailable');
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const main = doc.querySelector('main');
    main?.querySelectorAll('script, style, form, nav').forEach((node) => node.remove());
    return { ...event, detailText: main?.textContent || '' };
  } catch {
    return event;
  } finally {
    window.clearTimeout(timeout);
  }
})).then((indexed) => { indexedEvents = indexed; });

openButton.addEventListener('click', () => {
  updateYear();
  dispatch({ type: 'OPEN' });
  keyword.focus({ preventScroll: true });
});

function closePanel() {
  const list = view.mode === 'results' ? resultsList : $('#normal-event-list');
  const topBoundary = $('.section-navigation')?.getBoundingClientRect().bottom ?? 0;
  const visibleCard = [...list.querySelectorAll('.archive-card')].find((card) => {
    const rect = card.getBoundingClientRect();
    return rect.bottom > topBoundary && rect.top < window.innerHeight;
  });
  const position = {
    x: window.scrollX, y: window.scrollY,
    eventId: visibleCard?.dataset.event,
    top: visibleCard?.getBoundingClientRect().top
  };
  finishYearEdit(true);
  body.classList.toggle('is-restoring-event-position', true);
  dispatch({ type: 'CLOSE' });
  showError();
  const target = position.eventId && [...$('#normal-event-list').querySelectorAll('.archive-card')]
    .find((card) => card.dataset.event === position.eventId);
  const top = target ? window.scrollY + target.getBoundingClientRect().top - position.top : position.y;
  window.scrollTo({ left: position.x, top: Math.max(0, top), behavior: 'instant' });
  requestAnimationFrame(() => body.classList.toggle('is-restoring-event-position', false));
  openButton.focus({ preventScroll: true });
}
closeButton.addEventListener('click', closePanel);
panel.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !editingYear) { event.preventDefault(); closePanel(); }
});

yearCurrent.addEventListener('click', () => {
  editingYear = true;
  yearCurrent.hidden = true;
  yearEntry.hidden = false;
  yearEntry.focus();
  yearEntry.select();
});
yearEntry.addEventListener('blur', () => finishYearEdit());
yearEntry.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (finishYearEdit(event.key === 'Escape')) yearCurrent.focus();
  }
});
yearPrevious.addEventListener('click', () => { if (!yearPrevious.disabled) chooseYear(Number(yearPrevious.textContent)); });
yearNext.addEventListener('click', () => { if (!yearNext.disabled) chooseYear(Number(yearNext.textContent)); });
$('#all-event-years').addEventListener('click', () => chooseYear(null));
let yearWheelLock = 0;
$('#year-wheel').addEventListener('wheel', (event) => {
  if (event.ctrlKey || Math.abs(event.deltaY) < 4) return;
  event.preventDefault();
  if (performance.now() < yearWheelLock) return;
  yearWheelLock = performance.now() + 180;
  chooseYear((selectedYear ?? new Date().getFullYear()) + Math.sign(event.deltaY));
}, { passive: false });
$('#year-wheel').addEventListener('keydown', (event) => {
  if (editingYear || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  chooseYear((selectedYear ?? new Date().getFullYear()) + (event.key === 'ArrowDown' ? 1 : -1));
});

form.querySelectorAll('[data-season]').forEach((button) => {
  if (!seasons.includes(button.dataset.season)) return;
  button.addEventListener('click', () => button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true')));
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!finishYearEdit()) return;
  const filters = readFilters();
  const error = validateFilters(filters);
  if (error) return showError(error);
  showError();
  dispatch({ type: 'SEARCH_STARTED' });
  const requestId = view.requestId;
  await indexReady;
  const results = filterEvents(categoryRecords(indexedEvents), filters);
  dispatch({ type: 'SEARCH_FINISHED', requestId, filters, results });
  if (view.requestId !== requestId || !view.panelOpen) return;
  renderResults();
  window.scrollTo({ top: 0, behavior: 'instant' });
  resultsHeading.focus({ preventScroll: true });
});
oldestFirst.addEventListener('change', () => { if (view.mode === 'results') renderResults(); });

renderNormalEvents();
updateYear();
applyView();
if (categoryArea) canonicalizeOpportunityURL();
if (categoryArea && selectedCategory !== 'all' && (!opportunitiesPage || !window.location.hash)) requestAnimationFrame(() => scrollToCategory());
