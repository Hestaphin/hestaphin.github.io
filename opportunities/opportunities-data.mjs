// Images, activity titles and calendar wording follow the supplied Opportunities mockup.
// The reference gives months/seasons but no year; keep date null until a year is supplied.
export const pathways = [
  {
    id: 'orchestra', title: 'Join the Orchestra', url: '/opportunities/orchestra/',
    image: '/assets/opportunity-orchestra.png', imageAlt: 'A violinist under a white spotlight on a dark stage',
    action: { title: 'Apply here', url: '/opportunities/orchestra/apply/' },
    description: [
      'Musicians can tell us about their instrument, experience, and availability using the orchestra application form.',
      'Join selected artistic projects when instrumentation, repertoire, and preparation align.'
    ]
  },
  {
    id: 'club', title: 'Join the club', url: '/opportunities/club/',
    image: '/assets/opportunity-club-double-bass.png', imageAlt: 'An empty wooden chamber hall with chairs, music stands, and a double bass lying at the left of the stage',
    action: { title: 'Register here', url: '/opportunities/club/#club-registration-form' },
    description: [
      'Become a club member and take part in our musical community.',
      'A place for classical music lovers to follow activities and take part in the musical community.'
    ]
  }
];

export const opportunityActivities = [
  {
    id: 'club-ticket-discounts', project: 'club', label: '',
    title: 'Tickets discount for club members!', date: null,
    dateLabel: 'From July 5 to August 24', months: [7, 8], seasons: ['summer'],
    venue: '', image: '/assets/opportunity-club-double-bass.png',
    imageAlt: 'An empty wooden chamber hall with chairs, music stands, and a double bass lying at the left of the stage', imageWidth: 1672, imageHeight: 941,
    url: '/opportunities/club/ticket-discounts/', detailLabel: 'check it out',
    paragraphs: ['Tickets discount for club members!'],
    feature: ['Club', 'Tickets', 'July', 'August', 'Summer'],
    description: ['This activity for club members runs from July 5 to August 24.'],
    action: { title: 'Register here', url: '/opportunities/club/#club-registration-form' }
  },
  {
    id: 'orchestra-violin-masterclass', project: 'orchestra', label: '',
    title: 'Master violin class for orchestra members', date: null,
    dateLabel: 'Spring Season', months: [3, 4, 5], seasons: ['spring'],
    venue: '', image: '/assets/opportunity-orchestra.png',
    imageAlt: 'A violinist playing under a white spotlight', imageWidth: 1672, imageHeight: 941,
    url: '/opportunities/orchestra/violin-masterclass/', detailLabel: 'See details',
    paragraphs: ['Master violin class for orchestra members'],
    feature: ['Orchestra', 'Violin', 'Master class', 'Spring Season'],
    description: ['A master violin class for orchestra members in the Spring Season.'],
    action: { title: 'Apply here', url: '/opportunities/orchestra/apply/' }
  }
];
