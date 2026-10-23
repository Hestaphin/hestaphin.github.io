// Reveal two fixed, full-width image/text layers. Only their clipping boundary moves.
const stage = document.querySelector('[data-opportunity-reveal]');

if (stage) {
  const divider = stage.querySelector('.opportunity-divider');
  const club = stage.querySelector('#club');
  const orchestra = stage.querySelector('#orchestra');
  let split = 50;
  let activePointer = null;
  let grabOffset = 0;

  function reveal(next) {
    if (!Number.isFinite(next)) return;
    split = Math.round(Math.min(100, Math.max(0, next)) * 100) / 100;
    stage.style.setProperty('--opportunity-split', `${split}%`);
    divider.setAttribute('aria-valuenow', String(split));
    divider.setAttribute('aria-valuetext', `Club ${Math.round(split)}%, Orchestra ${Math.round(100 - split)}%`);
    club.inert = split === 0;
    orchestra.inert = split === 100;
    club.setAttribute('aria-hidden', String(club.inert));
    orchestra.setAttribute('aria-hidden', String(orchestra.inert));
  }

  function revealAt(clientX) {
    const bounds = stage.getBoundingClientRect();
    if (bounds.width > 0) reveal((clientX - grabOffset - bounds.left) / bounds.width * 100);
  }

  function finish(event) {
    if (activePointer === null || event.pointerId !== activePointer) return;
    const pointerId = activePointer;
    activePointer = null;
    grabOffset = 0;
    stage.classList.toggle('is-dragging', false);
    if (divider.hasPointerCapture?.(pointerId)) divider.releasePointerCapture(pointerId);
  }

  divider.addEventListener('pointerdown', (event) => {
    if (activePointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    activePointer = event.pointerId;
    const bounds = stage.getBoundingClientRect();
    grabOffset = event.clientX - bounds.left - bounds.width * split / 100;
    divider.focus({ preventScroll: true });
    divider.setPointerCapture?.(event.pointerId);
    stage.classList.toggle('is-dragging', true);
  });
  divider.addEventListener('pointermove', (event) => {
    if (activePointer === null || event.pointerId !== activePointer) return;
    event.preventDefault();
    revealAt(event.clientX);
  });
  divider.addEventListener('pointerup', (event) => {
    if (event.pointerId === activePointer) revealAt(event.clientX);
    finish(event);
  });
  divider.addEventListener('pointercancel', finish);
  divider.addEventListener('lostpointercapture', finish);
  divider.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 10 : 1;
    const values = {
      ArrowLeft: split - step, ArrowDown: split - step,
      ArrowRight: split + step, ArrowUp: split + step,
      PageDown: split - 10, PageUp: split + 10, Home: 0, End: 100
    };
    if (!(event.key in values)) return;
    event.preventDefault();
    reveal(values[event.key]);
  });
  divider.addEventListener('dblclick', (event) => { event.preventDefault(); reveal(50); });
  stage.addEventListener('focusin', (event) => {
    const side = event.target.closest('.opportunity-lead');
    if ((side === club && split < 50) || (side === orchestra && split > 50)) reveal(50);
  });

  reveal(50);
  divider.hidden = false;
}
