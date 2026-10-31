// Only supplied product information is published. The cover's concert date is
// artwork, not an asserted product publication date.
export const products = [{
  id: 'chopin-theme-textbook',
  title: 'Chopin theme textbook',
  url: '/shop/chopin-theme-textbook/',
  image: '/assets/shop-chopin-cover.png',
  imageAlt: 'Chopin theme textbook cover with a portrait of Frédéric Chopin',
  imageWidth: 1552,
  imageHeight: 2048,
  priceCents: 400,
  paragraphs: ['Chopin theme textbook, with a portrait of Frédéric Chopin on the cover.'],
  date: null
}, {
  id: 'debussy-theme-textbook',
  title: 'Debussy theme textbook',
  url: '/shop/debussy-theme-textbook/',
  image: '/assets/shop-debussy-cover.png',
  imageAlt: 'Debussy theme textbook cover with Claude Debussy lettering and a musical manuscript',
  imageWidth: 1552,
  imageHeight: 2048,
  priceCents: 400,
  paragraphs: ['Debussy theme textbook, with a Claude Debussy cover design.'],
  date: null
}];

export const productById = (id) => products.find((product) => product.id === id);
export const formatPrice = (cents) => `US$ ${(cents / 100).toFixed(2)}`;
