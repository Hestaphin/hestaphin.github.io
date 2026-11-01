(() => {
  const root = document.querySelector('#orchestra-portal');
  const progress = document.querySelector('#portal-loading-progress');
  const percentage = document.querySelector('#portal-loading-percent');
  if (!root || !progress || !percentage) return;
  const search = document.querySelector('#open-event-search');
  let value = 0, milestone = 0, painted = -1, settled = false, timer;

  function paint() {
    const next = Math.floor(value);
    if (next === painted) return;
    painted = next;
    percentage.textContent = next + '%';
    progress.setAttribute('aria-valuenow', String(next));
  }
  function stop() { clearInterval(timer); timer = undefined; }
  function start() {
    if (settled || timer !== undefined) return;
    timer = setInterval(() => {
      // This is an estimate, not a byte counter. Completed startup work moves
      // the floor; waiting requests can advance only a little beyond it.
      const ceiling = Math.min(99, milestone + 7);
      value = Math.min(ceiling, value + Math.max(.15, (ceiling - value) * .18));
      paint();
    }, 500);
  }
  function advance(next) {
    if (settled || !Number.isFinite(next)) return;
    milestone = Math.max(milestone, Math.min(99, Math.max(0, next)));
    value = Math.max(value, milestone);
    paint();
  }
  function finish() {
    if (settled) return;
    settled = true;
    stop();
    value = 100;
    paint();
    root.setAttribute('aria-busy', 'false');
    document.body.classList.remove('portal-loading');
    if (search) search.hidden = false;
  }
  function cancel() {
    if (settled) return;
    settled = true;
    stop();
    root.setAttribute('aria-busy', 'false');
    document.body.classList.remove('portal-loading');
    // Search requires loaded portal data and stays hidden after an error.
  }
  window.COPKU_PORTAL_LOADING = { advance, finish, cancel };
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  advance(4);
  start();
})();
