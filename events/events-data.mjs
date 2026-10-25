// Dates and placeholder copy come from the supplied Events design.
// Leave an event's date null until a date has actually been supplied.
export const events = [
  {
    id: 'chamber-concert', label: 'Event 1', title: 'Chamber concert',
    date: '2025-11-13', venue: 'Hall B', image: '/assets/event1.png',
    imageAlt: 'A flautist playing a silver flute in a dark room',
    url: '/events/chamber-concert/',
    paragraphs: [
      'Each year the orchestra will hold several events, such as chamber concert, we normally held events on today, tomorrow, and yesterday.',
      'Music is something that should be shared to everyone.'
    ],
    feature: ['November 13', 'Hall B', 'See our latest Event 1', 'Brilliant flute concert will give audi a huge surprise', 'come and listen']
  },
  {
    id: 'schubert', label: 'Event 2', title: 'Who is Schumann’s wife?',
    date: '2025-09-30', venue: 'Dalatskia Hall', image: '/assets/event3.png',
    imageAlt: 'Sheet music flying through a blue room at night',
    url: '/events/schumann/',
    paragraphs: [
      'There is a fully orchestrated new piece of ring going to be performed at Dalatskia Hall. And this is a text place holder that i dont know what to write more.',
      'For develop this website. Temporarily u can see these. Haha'
    ]
  },
  {
    id: 'harpsichord', label: 'Event 3', title: 'Harpsichord',
    date: null, venue: '', image: '/assets/event2.png',
    imageAlt: 'Gold decoration on a wooden harpsichord',
    url: '/events/harpsichord/',
    paragraphs: [
      'An encounter with the harpsichord and its place in chamber music.',
      'Programme, date, and booking information to be announced.'
    ]
  }
];
