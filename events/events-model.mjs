export const seasons = ['spring', 'summer', 'autumn', 'winter'];

export function latestSelectableYear(currentYear = new Date().getFullYear()) {
  return Math.min(9999, currentYear + 1);
}

export function normalizeText(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[‘’]/g, "'").toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function seasonFor(date) {
  if (!date) return null;
  const month = Number(date.slice(5, 7));
  return month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer'
    : month >= 9 && month <= 11 ? 'autumn' : 'winter';
}

export function validateFilters(filters, currentYear = new Date().getFullYear()) {
  const maximum = latestSelectableYear(currentYear);
  if (filters.year !== null && (!Number.isInteger(filters.year) || filters.year < 1 || filters.year > maximum)) {
    return `Enter a year from 1 to ${maximum}, or leave it blank for all years.`;
  }
  for (const month of [filters.from, filters.to]) {
    if (month && !/^(0?[1-9]|1[0-2])$/.test(String(month))) {
      return 'Choose a month from January to December.';
    }
  }
  if (filters.from && filters.to && Number(filters.from) > Number(filters.to)) {
    return 'From month must be earlier than or equal to To month.';
  }
  return '';
}

export function searchableText(event) {
  return normalizeText([
    event.title, event.label, event.venue, event.date, event.dateLabel, formatEventDate(event.date),
    event.date ? monthHeading(event.date.slice(0, 7)) : '', event.imageAlt,
    ...(event.feature || []), ...(event.paragraphs || []), event.detailText || ''
  ].join(' '));
}

function knownMonths(event) {
  if (event.date) return [Number(event.date.slice(5, 7))];
  return Array.isArray(event.months) ? event.months.filter((month) => Number.isInteger(month) && month >= 1 && month <= 12) : [];
}

export function filterEvents(events, filters) {
  const words = normalizeText(filters.keyword).split(' ').filter(Boolean);
  const fromMonth = Number(filters.from) || null;
  const toMonth = Number(filters.to) || null;
  return events.filter((event) => {
    if (words.length && !words.every((word) => searchableText(event).includes(word))) return false;
    if (filters.year !== null && (!event.date || Number(event.date.slice(0, 4)) !== filters.year)) return false;
    const eventSeasons = event.date ? [seasonFor(event.date)] : event.seasons || [];
    if (filters.seasons.length && !eventSeasons.some((season) => filters.seasons.includes(season))) return false;
    if (fromMonth || toMonth) {
      const months = knownMonths(event);
      if (!months.some((month) => (!fromMonth || month >= fromMonth) && (!toMonth || month <= toMonth))) return false;
    }
    return true;
  });
}

// Event dates are calendar dates in the orchestra's local timezone.
// Undated announcements remain upcoming until a performance date is supplied.
export function filterActivityCategory(records, category = 'all', now = new Date()) {
  if (category === 'all') return records;
  if (category !== 'upcoming' && category !== 'past') {
    return records.filter((record) => record.project === category);
  }
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const part = (type) => parts.find((value) => value.type === type).value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  return records.filter((record) => category === 'past'
    ? Boolean(record.date && record.date < today)
    : !record.date || record.date >= today);
}

export function sortEvents(events, newestFirst = true) {
  return [...events].sort((a, b) => {
    if (!a.date && !b.date) {
      const aMonth = Math.max(0, ...knownMonths(a));
      const bMonth = Math.max(0, ...knownMonths(b));
      if (!aMonth && bMonth) return 1;
      if (aMonth && !bMonth) return -1;
      return (newestFirst ? bMonth - aMonth : aMonth - bMonth) || a.id.localeCompare(b.id);
    }
    if (!a.date) return 1;
    if (!b.date) return -1;
    return (newestFirst ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) || a.id.localeCompare(b.id);
  });
}

export function groupByMonth(events) {
  const groups = new Map();
  for (const event of events) {
    const key = event.date?.slice(0, 7) || 'undated';
    if (!groups.has(key)) groups.set(key, { key, label: monthHeading(key), events: [] });
    groups.get(key).events.push(event);
  }
  return [...groups.values()];
}

export function monthHeading(key) {
  if (key === 'undated') return 'Dates to be announced';
  const [year, month] = key.split('-').map(Number);
  const name = ['January','February','March','April','May','June','July','August','September','October','November','December'][month - 1];
  return `${year} ${name}`;
}

export function formatEventDate(date) {
  if (!date) return 'Date to be announced';
  const [year, month, day] = date.split('-').map(Number);
  return `${year} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'][month - 1]} ${day}`;
}

export function createViewState() {
  return { panelOpen: false, mode: 'normal', loading: false, requestId: 0, results: [], applied: null };
}

export function reduceView(state, action) {
  switch (action.type) {
    case 'OPEN': return { ...state, panelOpen: true };
    case 'CLOSE': return { ...state, panelOpen: false, mode: 'normal', loading: false, requestId: state.requestId + 1, results: [], applied: null };
    case 'SEARCH_STARTED': return { ...state, panelOpen: true, loading: true, requestId: state.requestId + 1 };
    case 'SEARCH_FINISHED':
      if (action.requestId !== state.requestId || !state.panelOpen) return state;
      return { ...state, mode: 'results', loading: false, results: action.results, applied: { ...action.filters, seasons: [...action.filters.seasons] } };
    default: return state;
  }
}
