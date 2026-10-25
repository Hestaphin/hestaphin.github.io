/* Shared title bar and the interactions specified in the October 16 brief. */
(() => {
  'use strict';
  const root = document.documentElement;
  const homepage = document.body.classList.contains('homepage');
  const timedPage = homepage || document.body.classList.contains('has-reference-header');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const palette = [
    { key: 'C major', accidentals: 0, rgb: [255,255,255] },
    { key: 'A minor', accidentals: 0, rgb: [151,153,177] },
    { key: 'G major', accidentals: 1, rgb: [170,150,177] },
    { key: 'E minor', accidentals: 1, rgb: [151,177,176] },
    { key: 'D major', accidentals: 2, rgb: [177,158,168] },
    { key: 'B minor', accidentals: 2, rgb: [174,177,167] },
    { key: 'A major', accidentals: 3, rgb: [177,161,150] },
    { key: 'F♯ minor', accidentals: 3, rgb: [245,240,231] },
    { key: 'E major', accidentals: 4, rgb: [248,242,224] },
    { key: 'C♯ minor', accidentals: 4, rgb: [246,244,226] },
    { key: 'B major', accidentals: 5, rgb: [240,246,232] },
    { key: 'G♯ minor', accidentals: 5, rgb: [247,249,242] },
    { key: 'F♯ major', accidentals: 6, rgb: [234,247,238] },
    { key: 'D♯ minor', accidentals: 6, rgb: [231,246,243] },
    { key: 'D♭ major', accidentals: -5, rgb: [231,244,249] },
    { key: 'B♭ minor', accidentals: -5, rgb: [234,239,250] },
    { key: 'A♭ major', accidentals: -4, rgb: [239,235,249] },
    { key: 'F minor', accidentals: -4, rgb: [245,234,247] },
    { key: 'E♭ major', accidentals: -3, rgb: [250,234,241] },
    { key: 'C minor', accidentals: -3, rgb: [251,237,233] },
    { key: 'B♭ major', accidentals: -2, rgb: [249,240,230] },
    { key: 'G minor', accidentals: -2, rgb: [244,240,235] },
    { key: 'F major', accidentals: -1, rgb: [238,239,247] },
    { key: 'D minor', accidentals: -1, rgb: [247,246,250] }
  ];
  const accents = ['#fff', 'rgb(184,65,65)', 'rgb(201,100,31)', 'rgb(184,182,79)', 'rgb(10,54,23)', 'rgb(77,106,184)', '#fff'];

  // Twenty-four equal rectangles; the remaining right-hand area stays black.
  document.querySelectorAll('.title-tones').forEach((bar) => {
    for (let i = 0; i < 24; i++) {
      const tone = document.createElement('span');
      const level = Math.round(255 * (1 - i / 23));
      tone.style.setProperty('--tone', `rgb(${level},${level},${level})`);
      bar.append(tone);
    }
  });

  function drawSignature(count) {
    const svg = document.querySelector('.score-key');
    if (!svg) return;
    svg.replaceChildren();
    // Treble staff lines: F5=48, D5=72, B4=96, G4=120, E4=144.
    // Every diatonic step is half of the 24-unit staff space.
    const sharpPitches = [48, 84, 36, 72, 108, 60, 96]; // F C G D A E B
    const flatPitches = [96, 60, 108, 72, 120, 84, 132]; // B E A D G C F
    for (let i = 0; i < Math.abs(count); i++) {
      const note = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      const pitch = count > 0 ? sharpPitches[i] : flatPitches[i];
      note.setAttribute('href', count > 0 ? '#score-sharp' : '#score-flat');
      note.setAttribute('transform', `translate(${96 + i * 27} ${pitch}) scale(.096 -.096)`);
      svg.append(note);
    }
  }

  let lastHour = -1;
  function updateClock() {
    const now = new Date();
    const hour = now.getHours();
    const current = palette[hour];
    root.style.setProperty('--hour-background', `rgb(${current.rgb.join(',')})`);
    root.style.setProperty('--day-accent', accents[now.getDay()]);
    document.body.classList.toggle('weekend', [0, 6].includes(now.getDay()));
    if (hour !== lastHour) {
      lastHour = hour;
      drawSignature(current.accidentals);
      document.querySelector('.score-overlay')?.setAttribute('data-key', current.key);
    }
  }
  updateClock();
  if (timedPage) {
    window.setInterval(updateClock, 15000);
    window.addEventListener('focus', updateClock);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) updateClock();
    });
  }
  document.querySelectorAll('.section-navigation a, .main-nav a').forEach((link) => {
    const randomColour = () => link.style.setProperty('--weekend-colour', `hsl(${Math.floor(Math.random() * 360)} 56% 40%)`);
    link.addEventListener('pointerenter', randomColour);
    link.addEventListener('focus', randomColour);
  });
  if (!homepage) return;

  const hero = document.querySelector('.violin-hero');
  const content = document.querySelector('.home-content');
  const nav = document.querySelector('.section-navigation');
  let scrollFrame = 0;
  function updateScroll() {
    scrollFrame = 0;
    const styles = getComputedStyle(root);
    const distance = parseFloat(styles.getPropertyValue('--hero-exit-distance')) || 240;
    const progress = Math.min(1, Math.max(0, window.scrollY / distance));
    const eased = progress * progress * (3 - 2 * progress);
    const titleHeight = document.querySelector('.reference-topbar').getBoundingClientRect().height;
    const shift = Math.max(0, window.innerHeight - titleHeight - nav.getBoundingClientRect().height);
    root.style.setProperty('--nav-offset', `${(1 - eased) * shift}px`);
    root.style.setProperty('--nav-surface', `${Math.max(0, (progress - .35) / .65)}`);
    const brightness = Math.round(255 * (1 - eased));
    root.style.setProperty('--nav-ink', `rgb(${brightness},${brightness},${brightness})`);
    root.style.setProperty('--content-visibility', `${Math.max(0, (progress - .38) / .62)}`);
    hero.style.opacity = Math.max(0, 1 - progress / .72);
    const retired = progress >= .72;
    hero.classList.toggle('is-retired', retired);
    hero.inert = retired;
    hero.setAttribute('aria-hidden', String(retired));
    nav.dataset.overHero = String(!retired);
    content.inert = progress < .5;
    content.setAttribute('aria-hidden', String(progress < .5));
    nav.dataset.docked = String(progress === 1);
  }
  const queueScroll = () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll); };
  window.addEventListener('scroll', queueScroll, { passive: true });
  window.addEventListener('resize', queueScroll, { passive: true });
  window.addEventListener('pageshow', queueScroll);
  updateScroll();

  const navLinks = [...nav.querySelectorAll('a[href^="#"]')];
  const targets = navLinks.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  function setActive(id) {
    navLinks.forEach((link) => {
      if (link.hash === `#${id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  const visibleSections = new Set();
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) visibleSections.add(entry.target);
      else visibleSections.delete(entry.target);
    });
    if (window.scrollY < 120) return setActive('hero');
    const visible = [...visibleSections].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    if (visible.length) setActive(visible[0].id);
  }, { rootMargin: '-22% 0px -55% 0px', threshold: 0 });
  targets.forEach((target) => sectionObserver.observe(target));
  navLinks.forEach((link) => link.addEventListener('click', (event) => {
    const target = document.querySelector(link.hash);
    if (!target) return;
    event.preventDefault();
    setActive(target.id);
    const headerHeight = document.querySelector('.reference-topbar').getBoundingClientRect().height + nav.getBoundingClientRect().height;
    const top = target.id === 'hero' ? 0 : target.getBoundingClientRect().top + window.scrollY - headerHeight;
    window.scrollTo({ top, behavior: reducedMotion ? 'instant' : 'smooth' });
    history.replaceState(null, '', target.id === 'hero' ? window.location.pathname : link.hash);
  }));
  // Skip links and incoming section hashes reveal content without requiring a scroll gesture.
  document.querySelector('.skip-home')?.addEventListener('click', () => { content.inert = false; content.removeAttribute('aria-hidden'); });
  if (window.location.hash && window.location.hash !== '#hero') {
    requestAnimationFrame(() => {
      const target = document.querySelector(window.location.hash);
      if (target) {
        content.inert = false;
        const offset = document.querySelector('.reference-topbar').getBoundingClientRect().height + nav.getBoundingClientRect().height;
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'instant' });
        updateScroll();
      }
    });
  }

  const viewport = document.querySelector('.event-viewport');
  const cards = [...viewport.querySelectorAll('.event-card')];
  const buttons = [...document.querySelectorAll('.event-sequence button')];
  const status = document.querySelector('.carousel-status');
  let active = 1;
  let drag = null;
  let dragged = false;
  let wheelLock = 0;
  function positionFor(index) {
    return cards[index].offsetLeft - viewport.offsetLeft - (viewport.clientWidth - cards[index].offsetWidth) / 2;
  }
  function updateSequence(index, announce = false) {
    active = index;
    cards.forEach((card) => {
      const inset = Math.min(card.offsetWidth * .8, Math.max(card.offsetWidth * .05, viewport.scrollLeft + viewport.offsetLeft - card.offsetLeft + viewport.clientWidth * .01));
      card.querySelector('.event-title').style.left = `${inset}px`;
    });
    buttons.forEach((button, i) => {
      if (i === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    if (announce) status.textContent = `Event ${index + 1} of ${cards.length}: ${cards[index].getAttribute('aria-label')}`;
  }
  function goTo(index, animate = true) {
    index = Math.min(cards.length - 1, Math.max(0, index));
    viewport.scrollTo({ left: positionFor(index), behavior: animate && !reducedMotion ? 'smooth' : 'instant' });
    updateSequence(index, animate);
  }
  buttons.forEach((button, index) => button.addEventListener('click', () => goTo(index)));
  viewport.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    goTo(event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : active + (event.key === 'ArrowRight' ? 1 : -1));
  });
  viewport.addEventListener('wheel', (event) => {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const direction = Math.sign(event.deltaY);
    if (!direction || (direction < 0 && active === 0) || (direction > 0 && active === cards.length - 1)) return;
    event.preventDefault();
    if (performance.now() < wheelLock || Math.abs(event.deltaY) < 8) return;
    wheelLock = performance.now() + 420;
    goTo(active + direction);
  }, { passive: false });
  viewport.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = { x: event.clientX, left: viewport.scrollLeft, pointer: event.pointerId };
    dragged = false;
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!drag) return;
    if (Math.abs(event.clientX - drag.x) > 6) {
      dragged = true;
      viewport.classList.add('is-dragging');
      viewport.setPointerCapture(drag.pointer);
      viewport.scrollLeft = drag.left - (event.clientX - drag.x);
    }
  });
  function endDrag() {
    if (!drag) return;
    drag = null;
    viewport.classList.remove('is-dragging');
    if (dragged) goTo(nearestCard());
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('lostpointercapture', endDrag);
  window.addEventListener('pointerup', endDrag);
  viewport.addEventListener('dragstart', (event) => event.preventDefault());
  viewport.addEventListener('click', (event) => { if (dragged) { event.preventDefault(); dragged = false; } }, true);
  function nearestCard() {
    let nearest = 0;
    cards.forEach((_, index) => {
      if (Math.abs(positionFor(index) - viewport.scrollLeft) < Math.abs(positionFor(nearest) - viewport.scrollLeft)) nearest = index;
    });
    return nearest;
  }
  let reelFrame = 0;
  viewport.addEventListener('scroll', () => {
    if (reelFrame) return;
    reelFrame = requestAnimationFrame(() => { reelFrame = 0; updateSequence(nearestCard()); });
  }, { passive: true });
  new ResizeObserver(() => { if (!drag) goTo(active, false); }).observe(viewport);
  goTo(1, false);
})();
