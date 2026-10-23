// One visual chooser; Orchestra and Club authenticate through separate systems.
(() => {
  const dialog = document.createElement('dialog');
  dialog.className = 'site-login-window';
  dialog.id = 'site-login-window';
  dialog.setAttribute('aria-labelledby', 'site-login-title');
  dialog.innerHTML = `<div class="site-login-heading"><h2 id="site-login-title">Login</h2><button type="button" class="site-login-close" aria-label="Close login">×</button></div>
    <div class="site-login-tabs" role="tablist" aria-label="Account type"><button type="button" role="tab" id="login-orchestra-tab" aria-controls="site-login-form" aria-selected="true" data-login-account="orchestra">Orchestra</button><button type="button" role="tab" id="login-club-tab" aria-controls="site-login-form" aria-selected="false" tabindex="-1" data-login-account="club">Club</button></div>
    <form id="site-login-form" class="site-login-form" method="post" role="tabpanel" aria-labelledby="login-orchestra-tab">
      <label for="site-login-username">Username or email</label><input id="site-login-username" type="text" name="email" autocomplete="username" aria-describedby="site-login-identity-hint" required autofocus>
      <span class="visually-hidden" id="site-login-identity-hint">Use your Orchestra username or email address. Club accounts use their email address.</span>
      <label for="site-login-password">Password</label><input id="site-login-password" type="password" name="password" autocomplete="current-password" required>
      <p class="site-login-error" id="site-login-error" role="alert" hidden></p>
      <p class="site-login-account-note">Club and orchestra accounts are separate.</p>
      <p class="site-login-account-links"><a id="site-login-portal" href="/portal/internal/" hidden>Open your portal</a><button type="button" id="club-reset-password" hidden>Forgot Club password?</button></p>
      <div class="site-login-actions"><a href="/opportunities/">Not a member yet?</a><button type="submit">Login</button></div>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const username = dialog.querySelector('#site-login-username');
  const password = dialog.querySelector('#site-login-password');
  const errorBox = dialog.querySelector('#site-login-error');
  const closeButton = dialog.querySelector('.site-login-close');
  const submit = dialog.querySelector('button[type="submit"]');
  const tabs = [...dialog.querySelectorAll('[data-login-account]')];
  const portalLink = dialog.querySelector('#site-login-portal');
  const resetButton = dialog.querySelector('#club-reset-password');
  const directLogin = /^\/login\/(?:index\.html)?$/.test(window.location.pathname);
  let account = 'orchestra';
  let opener = null;
  let busy = false;

  function selectAccount(value, focus = false) {
    if (busy) return;
    account = value === 'club' ? 'club' : 'orchestra';
    for (const tab of tabs) {
      const selected = tab.dataset.loginAccount === account;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus({ preventScroll: true });
    }
    form.setAttribute('aria-labelledby', `login-${account}-tab`);
    password.value = '';
    errorBox.hidden = true;
    resetButton.hidden = false; resetButton.textContent = account === 'club' ? 'Forgot Club password?' : 'Forgot Orchestra password?';
    portalLink.hidden = true;
    const selectedAccount = account;
    Promise.resolve(window.COPKUAuth?.getPortalDestination(selectedAccount)).then((destination) => {
      if (account !== selectedAccount || !destination) return;
      portalLink.href = destination;
      portalLink.textContent = `Open your ${selectedAccount === 'club' ? 'Club' : 'Orchestra'} portal`;
      portalLink.hidden = false;
    }).catch(() => {});
  }
  function openLogin(value, trigger) {
    selectAccount(value);
    opener = trigger || document.activeElement;
    if (!dialog.open) dialog.showModal();
    document.body.classList.toggle('has-login-window', true);
    username.focus({ preventScroll: true });
  }
  function closeLogin() { if (!busy) dialog.close(); }
  closeButton.addEventListener('click', closeLogin);
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    document.body.classList.toggle('has-login-window', false);
    password.value = '';
    if (directLogin) window.location.href = '/';
    else opener?.focus({ preventScroll: true });
  });
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectAccount(tab.dataset.loginAccount));
    tab.addEventListener('keydown', (event) => {
      const positions = { ArrowLeft: (index + 1) % 2, ArrowRight: (index + 1) % 2, Home: 0, End: 1 };
      if (!(event.key in positions)) return;
      event.preventDefault();
      selectAccount(tabs[positions[event.key]].dataset.loginAccount, true);
    });
  });
  resetButton.addEventListener('click', async () => {
    if (busy || !username.reportValidity()) return;
    busy = true;
    [submit, closeButton, resetButton, ...tabs].forEach((button) => { button.disabled = true; });
    errorBox.hidden = true;
    try {
      if (account === 'orchestra') {
        const client = window.COPKUOrchestraClient();
        const { data, error } = await client.functions.invoke('portal-password-help', { body: { identifier: username.value.trim().toLowerCase() } });
        if (error || data?.error) throw new Error(data?.error || error.message);
        errorBox.textContent = data.message; errorBox.hidden = false; return;
      }
      if (!window.COPKUClub) throw new Error('Club password reset is unavailable right now.');
      await window.COPKUClub.sendPasswordReset(username.value.trim().toLowerCase());
      errorBox.textContent = 'If this email belongs to a Club account, a password reset link has been sent.';
      errorBox.hidden = false;
    } catch (error) {
      errorBox.textContent = error.message || 'Could not send a password email. Please try again.';
      errorBox.hidden = false;
    } finally {
      busy = false;
      [submit, closeButton, resetButton, ...tabs].forEach((button) => { button.disabled = false; });
    }
  });
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || !/^\/login\/(?:index\.html)?$/.test(url.pathname)) return;
    event.preventDefault();
    openLogin(url.searchParams.get('account'), link);
  });
  // Never fall through to a native credential form submission while auth loads.
  document.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-club-registration]') || event.target.dataset.authReady === 'true') return;
    event.preventDefault();
    const error = event.target.querySelector('.form-error');
    error.textContent = 'Please wait for registration to finish loading, then try again.';
    error.hidden = false;
  }, true);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    errorBox.hidden = true;
    busy = true;
    submit.textContent = 'Logging in…';
    [submit, closeButton, resetButton, ...tabs].forEach((button) => { button.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    try {
      if (!window.COPKUAuth?.signInToPortal) throw new Error('Login is unavailable right now. Please try again.');
      const destination = await window.COPKUAuth.signInToPortal(account, username.value.trim().toLowerCase(), password.value);
      window.location.href = destination;
    } catch (error) {
      errorBox.textContent = error.message || 'Could not sign in. Please try again.';
      errorBox.hidden = false;
    } finally {
      busy = false;
      submit.textContent = 'Login';
      [submit, closeButton, resetButton, ...tabs].forEach((button) => { button.disabled = false; });
      form.setAttribute('aria-busy', 'false');
    }
  });
  if (directLogin) openLogin(new URLSearchParams(window.location.search).get('account'));
})();
