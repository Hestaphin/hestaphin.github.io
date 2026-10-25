// Shared disclosure navigation. Parent links keep their ordinary destinations.
(() => {
  const navigations = [...document.querySelectorAll('.section-navigation, .main-nav')];
  const disclosures = [];
  function closeAll(except = null) {
    disclosures.forEach((item) => { if (item !== except) item.setOpen(false); });
  }
  for (const navigation of navigations) {
    for (const group of navigation.querySelectorAll('[data-navigation-group]')) {
      const parent = group.querySelector('[data-navigation-parent]');
      const toggle = group.querySelector('[data-navigation-toggle]');
      const panel = group.querySelector('.navigation-submenu');
      const links = [...panel.querySelectorAll('a')];
      let pointerInside = false;
      let open = false;
      const item = {
        group, navigation,
        setOpen(value) {
          open = value;
          group.classList.toggle('is-submenu-open', open);
          toggle.setAttribute('aria-expanded', String(open));
          panel.setAttribute('aria-hidden', String(!open));
          panel.inert = !open;
        }
      };
      disclosures.push(item);
      item.setOpen(false);
      toggle.hidden = false;
      function show() { closeAll(item); item.setOpen(true); }
      group.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'touch') return;
        pointerInside = true; show();
      });
      group.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'touch') return;
        pointerInside = false;
        if (!group.contains(document.activeElement)) item.setOpen(false);
      });
      toggle.addEventListener('click', () => {
        if (open) item.setOpen(false); else show();
      });
      group.addEventListener('focusout', () => {
        queueMicrotask(() => {
          if (!pointerInside && !group.contains(document.activeElement)) item.setOpen(false);
        });
      });
      function enterWithArrow(event) {
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault(); show();
        (event.key === 'ArrowDown' ? links[0] : links.at(-1))?.focus({ preventScroll: true });
      }
      parent.addEventListener('keydown', enterWithArrow);
      toggle.addEventListener('keydown', enterWithArrow);
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault(); event.stopPropagation();
          item.setOpen(false); parent.focus({ preventScroll: true });
        }
      });
      panel.addEventListener('keydown', (event) => {
        const index = links.indexOf(document.activeElement);
        if (index < 0) return;
        const destinations = { ArrowDown: (index + 1) % links.length, ArrowUp: (index - 1 + links.length) % links.length, Home: 0, End: links.length - 1 };
        if (!(event.key in destinations)) return;
        event.preventDefault(); links[destinations[event.key]].focus({ preventScroll: true });
      });
      panel.addEventListener('click', (event) => {
        if (event.target.closest('a')) closeAll();
      });
    }
    // Homepage titles scroll within the document, so explicitly dismiss their menus.
    navigation.addEventListener('click', (event) => {
      const link = event.target.closest('a');
      if (link && !link.closest('.navigation-submenu')) closeAll();
    });
    navigation.setAttribute('data-dropdowns-ready', '');
    // Retained account pages have their existing small-screen menu button.
    navigation.closest('.nav-wrap')?.querySelector('.menu-toggle')?.addEventListener('click', () => {
      queueMicrotask(() => { if (!navigation.classList.contains('show')) closeAll(); });
    });
  }
  document.addEventListener('pointerdown', (event) => {
    if (!navigations.some((navigation) => navigation.contains(event.target))) closeAll();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeAll(); });
  window.addEventListener('blur', () => closeAll());
  document.addEventListener('visibilitychange', () => { if (document.hidden) closeAll(); });
})();
