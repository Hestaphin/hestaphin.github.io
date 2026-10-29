// Topics follow the supplied Learn design. Entries preserve existing site content;
// no publication date was supplied for either entry.
export const topics = [
  {
    id: 'fun-facts', title: 'Fun facts', url: '/learn/fun-facts/',
    description: ['Discover the stories behind the music in our listening events and teaching activities.']
  },
  {
    id: 'music-theory', title: 'Music theory', url: '/learn/music-theory/',
    description: ['Compact lessons on harmony, form, rhythm, texture, and ensemble listening, designed to connect musical concepts with real pieces.']
  },
  {
    id: 'magazine', title: 'Magazine', url: '/learn/magazine/',
    description: ['A place for listening guides, repertoire discussions, and writing from our musical community.']
  },
  {
    id: 'research-centre', title: 'Research centre', url: '/learn/research-centre/',
    description: ['A place for research into repertoire, performance, and musical learning.']
  }
];

export const lessons = [
  {
    id: 'schuberts-wife', project: 'fun-facts', label: 'Fun facts',
    title: 'Who is Schumann’s wife?', date: null, venue: '', legacyAnchor: 'schubert',
    image: '/assets/event3.png', imageAlt: 'Sheet music flying through a blue room at night',
    url: '/learn/fun-facts/schumanns-wife/',
    paragraphs: ['Discover the stories behind the music in our listening events and teaching activities.'],
    feature: ['Fun facts', 'Listening guides', 'Schumann'],
    action: { title: 'See the learning event', url: '/events/schumann/' }
  },
  {
    id: 'major-keys', project: 'music-theory', label: 'Music theory',
    title: 'What are 12 Major Keys?', date: null, venue: '', legacyAnchor: 'major-keys',
    image: '/assets/event3.png', imageAlt: 'Flying music scores in a blue room',
    url: '/learn/music-theory/major-keys/',
    paragraphs: ['Explore harmony, key signatures, and the vocabulary behind the music we perform.'],
    feature: ['Music theory', 'Major keys', 'Harmony', 'Key signatures'],
    action: { title: 'Ask about music theory sessions', url: '/contact/' }
  }
];
