import { latestSelectableYear, validateFilters, filterEvents, sortEvents, groupByMonth, normalizeText } from '../events/events-model.mjs';
export { sortEvents, groupByMonth, validateFilters };

function dateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function portalSearchRecords({ tasks = [], notifications = [], members = [] } = {}) {
  return [
    ...tasks.filter(t => !t.withdrawn).map(t => ({
      id: `task:${t.id}`, recordId: t.id, type: 'Task', title: t.title,
      label: t.kind, detailText: [t.body?.text, t.body?.attachment_name].filter(Boolean).join(' '), date: dateOnly(t.starts_at),
      excerpt: t.body?.text || ''
    })),
    ...notifications.map(n => ({
      id: `notification:${n.id}`, recordId: n.id, type: 'Notification', title: n.subject,
      label: 'Notification', detailText: [n.body, ...(n.attachments || []).map(a => a.name)].filter(Boolean).join(' '), date: dateOnly(n.created_at), excerpt: n.body
    })),
    ...members.map(m => ({
      id: `member:${m.user_id}`, recordId: m.user_id, type: 'Member', title: m.full_name || m.email,
      label: 'Member', detailText: [m.email, m.instrument, m.group_name, m.display_id].filter(Boolean).join(' '),
      date: dateOnly(m.created_at), excerpt: [m.instrument, m.group_name].filter(Boolean).join(' · ')
    }))
  ];
}
export function searchPortal(records, filters) {
  const error = validateFilters(filters);
  if (error) throw new Error(error);
  // Reuse About's normalization, all-word matching, year/season/month semantics.
  return filterEvents(records, { ...filters, keyword: normalizeText(filters.keyword) });
}
export function bindPortalSearch({ onSearch, onClose }) {
  const $ = selector => document.querySelector(selector);
  const body = document.body;
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
  let selectedYear = null, editingYear = false, requestId = 0;
  let normalPosition = { left: 0, top: 0 };
  const showError = (message = '') => { errorBox.textContent = message; errorBox.hidden = !message; };
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
    if (!cancel && message) { showError(message); yearEntry.setAttribute('aria-invalid', 'true'); return false; }
    if (!cancel) selectedYear = parsed;
    editingYear = false; yearEntry.hidden = true; yearCurrent.hidden = false;
    yearEntry.removeAttribute('aria-invalid'); showError(); updateYear(); return true;
  }
  function chooseYear(year) {
    finishYearEdit(true);
    selectedYear = year === null ? null : Math.min(latestSelectableYear(), Math.max(1, year));
    updateYear(); showError();
  }
  function open() {
    if (!body.classList.contains('is-search-mode')) normalPosition = { left: window.scrollX, top: window.scrollY };
    updateYear();
    body.classList.add('is-filter-open');
    panel.inert = false; panel.setAttribute('aria-hidden', 'false');
    openButton.hidden = true; openButton.setAttribute('aria-expanded', 'true');
    keyword.focus({ preventScroll: true });
  }
  function close({ focus = true } = {}) {
    requestId++;
    finishYearEdit(true);
    body.classList.add('is-restoring-event-position');
    body.classList.remove('is-filter-open', 'is-search-mode');
    panel.inert = true; panel.setAttribute('aria-hidden', 'true');
    openButton.hidden = false; openButton.setAttribute('aria-expanded', 'false');
    searchButton.disabled = false; searchButton.textContent = 'SEARCH';
    showError(); onClose?.();
    window.scrollTo({ ...normalPosition, behavior: 'instant' });
    requestAnimationFrame(() => body.classList.remove('is-restoring-event-position'));
    if (focus) openButton.focus({ preventScroll: true });
  }
  openButton.addEventListener('click', open);
  closeButton.addEventListener('click', () => close());
  panel.addEventListener('keydown', event => { if (event.key === 'Escape' && !editingYear) { event.preventDefault(); close(); } });
  yearCurrent.addEventListener('click', () => { editingYear = true; yearCurrent.hidden = true; yearEntry.hidden = false; yearEntry.focus(); yearEntry.select(); });
  yearEntry.addEventListener('blur', () => finishYearEdit());
  yearEntry.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (finishYearEdit(event.key === 'Escape')) yearCurrent.focus();
    }
  });
  yearPrevious.addEventListener('click', () => { if (!yearPrevious.disabled) chooseYear(Number(yearPrevious.textContent)); });
  yearNext.addEventListener('click', () => { if (!yearNext.disabled) chooseYear(Number(yearNext.textContent)); });
  $('#all-event-years').addEventListener('click', () => chooseYear(null));
  let wheelLock = 0;
  $('#year-wheel').addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaY) < 4) return;
    event.preventDefault();
    if (performance.now() < wheelLock) return;
    wheelLock = performance.now() + 180;
    chooseYear((selectedYear ?? new Date().getFullYear()) + Math.sign(event.deltaY));
  }, { passive: false });
  $('#year-wheel').addEventListener('keydown', event => {
    if (editingYear || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); chooseYear((selectedYear ?? new Date().getFullYear()) + (event.key === 'ArrowDown' ? 1 : -1));
  });
  form.querySelectorAll('[data-season]').forEach(button => button.addEventListener('click', () => button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'))));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!finishYearEdit()) return;
    const filters = { keyword: keyword.value, year: selectedYear, seasons: [...form.querySelectorAll('[data-season][aria-pressed="true"]')].map(b => b.dataset.season), from: $('#event-from-month').value, to: $('#event-to-month').value };
    const error = validateFilters(filters); if (error) return showError(error);
    showError(); searchButton.disabled = true; searchButton.textContent = 'SEARCHING…';
    const current = ++requestId;
    try {
      const records = await onSearch(filters);
      if (current !== requestId || !body.classList.contains('is-filter-open')) return;
      body.classList.add('is-search-mode');
      document.dispatchEvent(new CustomEvent('portal-search-results', { detail: { records, filters } }));
    } catch (err) { if (current === requestId) showError(err.message); }
    finally { if (current === requestId) { searchButton.disabled = false; searchButton.textContent = 'SEARCH'; } }
  });
  updateYear();
  return { close, open };
}
