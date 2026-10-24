// The dropdown, sidebar and category pages use the same destinations.
export const opportunityCategories = [
  { id: 'orchestra', title: 'Orchestra', url: '/opportunities/orchestra/' },
  { id: 'wind-band', title: 'Wind band', url: '/opportunities/wind-band/' },
  { id: 'choir', title: 'Choir', url: '/opportunities/choir/' },
  { id: 'keyboard', title: 'Keyboard', url: '/opportunities/keyboard/' },
  { id: 'club', title: 'Club', url: '/opportunities/club/' }
];

export function opportunityCategoryURL(category) {
  return opportunityCategories.find((item) => item.id === category)?.url || '/opportunities/';
}

export function legacyOpportunityCategory(hash = '') {
  if (hash === '#opportunity-activities') return 'all';
  return opportunityCategories.find((item) => hash === `#${item.id}` || hash === `#${item.id}-activities`)?.id;
}

export function opportunityCategoryFromLocation(pathname = '/opportunities/', hash = '') {
  const path = pathname.replace(/\/index\.html$/, '/').replace(/\/?$/, '/');
  const route = opportunityCategories.find((item) => item.url === path);
  return legacyOpportunityCategory(hash) ?? route?.id ?? 'all';
}
