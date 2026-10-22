/* Club authentication is deliberately independent of the orchestra client in app.js. */
(() => {
  'use strict';
  const PORTAL = '/portal/membership/';
  const BASIC = 'Membership Basic';
  const callbackParams = new URLSearchParams(window.location.hash.slice(1));
  const passwordReturn = callbackParams.get('type') === 'recovery' || callbackParams.get('type') === 'invite';
  let client = null;
  let logoutTimer = null;
  let watching = false;
  let renderVersion = 0;
  const $ = (selector, root = document) => root.querySelector(selector);
  const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const text = (node, value) => { if (node) { node.textContent = value; node.hidden = !value; } };
  const date = (value) => value ? new Date(value).toLocaleDateString() : '—';
  const money = (amount, currency) => new Intl.NumberFormat('en', { style: 'currency', currency: (currency || 'cny').toUpperCase() }).format(amount / 100);
  const field = (form, name) => $(`[name="${name}"]`, form);

  function getClient() {
    if (client) return client;
    const url = window.COPKU_CLUB_SUPABASE_URL?.trim();
    const key = window.COPKU_CLUB_SUPABASE_PUBLISHABLE_KEY?.trim();
    if (!window.supabase || !url || !key) return null;
    try {
      const project = new URL(url);
      const orchestra = new URL(window.PUCO_SUPABASE_URL);
      if (project.protocol !== 'https:' || project.origin === orchestra.origin) return null;
      client = window.supabase.createClient(project.origin, key, {
        auth: {
          storageKey: 'copku-club-auth-v1',
          persistSession: true,
          autoRefreshToken: true,
          flowType: 'implicit',
          // Only the Club callback destination may consume Club confirmation tokens.
          detectSessionInUrl: window.location.pathname === PORTAL,
        },
      });
      return client;
    } catch { return null; }
  }

  async function member() {
    const supabase = getClient();
    if (!supabase) return null;
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const user = sessionData.session?.user;
    if (!user) return null;
    const { data, error } = await supabase.from('club_profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data?.account_type === 'club' ? data : null;
  }

  async function portalDestination() {
    try { return await member() ? PORTAL : null; } catch { return null; }
  }

  async function signIn(email, password) {
    const supabase = getClient();
    if (!supabase) throw new Error('Club login is unavailable right now. Please try again later.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    try {
      const profile = await member();
      if (!profile) throw new Error('This account is not a Club account. Please register on the Club page.');
      if (profile.approval_status !== 'approved') throw new Error(profile.approval_status === 'rejected' ? 'Your registration was not approved. Please contact the administrator.' : 'Your email is confirmed. Your registration is awaiting administrator approval.');
      return PORTAL; // Basic and expired paid memberships retain Club portal access.
    } catch (error) {
      await supabase.auth.signOut({ scope: 'local' });
      throw error;
    }
  }

  async function sendPasswordReset(email) {
    const supabase = getClient();
    if (!supabase) throw new Error('Club password reset is unavailable right now. Please try again later.');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${PORTAL}?set_password=1`,
    });
    if (error) throw error;
  }

  async function signOut() {
    const supabase = getClient();
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    }
    clearTimeout(logoutTimer);
    window.location.href = '/login/?account=club';
  }

  function watchSession() {
    if (watching) return;
    watching = true;
    const reset = () => {
      clearTimeout(logoutTimer);
      logoutTimer = setTimeout(() => signOut().catch(() => {
        window.location.href = '/login/?account=club';
      }), 30 * 60 * 1000);
    };
    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((name) => window.addEventListener(name, reset, { passive: true }));
    reset();
  }

  async function setupRegistration() {
    const form = $('#club-registration-form');
    if (!form) return;
    const notice = $('#club-registration-notice');
    const button = $('button[type="submit"]', form);
    const supabase = getClient();
    // A disabled form has no native fallback that could send a password as a page URL.
    form.addEventListener('submit', (event) => event.preventDefault());
    if (!supabase) {
      text(notice, 'Free Club registration is temporarily unavailable. Please try again later.');
      return;
    }
    try {
      if (await member()) {
        form.hidden = true;
        $('#club-existing-account').hidden = false;
        return;
      }
    } catch {
      text(notice, 'Club registration could not load. Please try again later.');
      return;
    }
    let busy = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      text($('.form-error', form), '');
      text($('.form-success', form), '');
      const password = field(form, 'password').value;
      if (password !== field(form, 'confirmPassword').value) {
        text($('.form-error', form), 'The passwords do not match.');
        return;
      }
      if (!field(form, 'fullName').value.trim()) {
        text($('.form-error', form), 'Please enter your name.');
        return;
      }
      busy = true;
      button.disabled = true;
      button.textContent = 'Creating account…';
      try {
        // No tier, role, price or payment metadata is accepted from this form.
        const { data, error } = await supabase.auth.signUp({
          email: field(form, 'email').value.trim().toLowerCase(),
          password,
          options: {
            data: { full_name: field(form, 'fullName').value.trim() },
            emailRedirectTo: `${window.location.origin}${PORTAL}?welcome=1`,
          },
        });
        if (error) throw error;
        form.reset();
        if (data?.session) {
          if (!await member()) throw new Error('Your Club profile could not load. Please try signing in again.');
          window.location.href = PORTAL;
        } else {
          text($('.form-success', form), 'Check your email to verify your account. Administrator approval is also required before Club access. Then sign in using the Club tab. If you already have an account, please sign in.');
        }
      } catch (error) {
        text($('.form-error', form), error.message || 'Could not register. Please try again.');
      } finally {
        busy = false;
        button.disabled = false;
        button.textContent = 'Create free Club account';
      }
    });
    form.dataset.authReady = 'true';
    button.disabled = false;
  }

  function currentMembership(profile) {
    const paid = profile.membership_status === 'active' && Date.parse(profile.paid_through) > Date.now();
    return { paid, tier: paid ? profile.membership_tier : BASIC };
  }

  function portalError(root, message) {
    root.innerHTML = `<section class="panel"><h2>Club member portal</h2><p role="alert">${escape(message)}</p><p><a href="/login/?account=club">Club login</a> · <a href="/opportunities/club/#club-registration-form">Free Club registration</a></p></section>`;
  }

  async function renderPortal(refreshAttempt = 0) {
    const root = $('#membership-portal');
    if (!root) return;
    const version = ++renderVersion;
    const supabase = getClient();
    if (!supabase) {
      portalError(root, 'The Club member portal is temporarily unavailable. Please try again later.');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (callbackParams.has('error')) {
      portalError(root, 'This Club email link has expired or is invalid. Sign in or request a new password email from the Club login tab.');
      return;
    }
    let profile;
    try { profile = await member(); } catch {
      portalError(root, 'Your Club account could not load. Please try again.');
      return;
    }
    if (!profile) {
      window.location.href = '/login/?account=club';
      return;
    }
    if (profile.approval_status !== 'approved' && !passwordReturn && !params.has('set_password')) {
      portalError(root, profile.approval_status === 'rejected' ? 'Your registration was not approved. Please contact the administrator.' : 'Your account is awaiting administrator approval. Refresh this page after approval.'); return;
    }
    watchSession();
    const [plansResult, ordersResult] = await Promise.all([
      supabase.from('club_plans').select('slug,name,description,price_cents,currency,duration_months,sort_order').eq('active', true).order('sort_order'),
      supabase.from('club_orders').select('plan_name,amount_cents,currency,paid_at,stripe_checkout_session_id').eq('user_id', profile.user_id).order('paid_at', { ascending: false }).limit(20),
    ]);
    if (version !== renderVersion) return;
    const { paid, tier } = currentMembership(profile);
    const ranks = { 'Membership Standard': 1, 'Membership Supporter': 2, 'Membership Patron': 3 };
    const plans = (plansResult.data || []).filter((plan) => !paid || (ranks[plan.slug] || 0) >= (ranks[tier] || 0));
    const orders = ordersResult.data || [];
    const returnedSession = params.get('session_id');
    const confirmed = returnedSession && orders.some((order) => order.stripe_checkout_session_id === returnedSession);
    let paymentMessage = '';
    if (params.get('checkout') === 'cancel') paymentMessage = 'Payment was cancelled. Your current membership has not changed.';
    if (params.get('checkout') === 'success') paymentMessage = confirmed ? 'Payment confirmed. Your Club membership is updated.' : 'Your payment is being confirmed. Your membership will update after confirmation.';
    root.innerHTML = `<div class="dashboard-shell club-dashboard">
      <aside class="dashboard-sidebar panel">
        <span class="tag">${escape(tier)}</span><h2>Club member portal</h2>
        <p>${escape(profile.full_name || profile.email)}</p><p>${escape(profile.email)}</p>
        <p class="small-note">${paid ? `Paid through ${escape(date(profile.paid_through))}` : 'Free membership · No payment required'}</p>
        <button class="btn btn-secondary" type="button" id="club-logout">Log out of Club</button>
        <p class="small-note">Your orchestra account has its own login and portal.</p><a href="/login/?account=orchestra">Orchestra login</a>
        <p id="club-logout-error" class="form-error" role="alert" hidden></p>
      </aside><div class="dashboard-main">
        <section class="panel"><p class="eyebrow">Membership</p><h3>Your current membership</h3>
          <p><strong>${escape(tier)}</strong></p>
          <p>${paid ? 'Your paid membership includes member updates, selected souvenirs and shop benefits.' : 'Welcome to the Club. Follow our activities and musical community. Upgrade here whenever you choose.'}</p>
          ${!paid && profile.membership_tier !== BASIC ? '<p class="small-note">Your previous paid membership has ended. Your free Basic account remains available.</p>' : ''}
        </section>
        <section class="panel" id="club-upgrades"><p class="eyebrow">Upgrade &amp; payment</p><h3>${paid ? 'Upgrade or renew your membership' : 'Upgrade your membership'}</h3>
          <p id="club-payment-status" class="small-note" role="status"${paymentMessage ? '' : ' hidden'}>${escape(paymentMessage)}</p>
          ${params.has('checkout') ? '<button class="btn btn-secondary" id="club-refresh-payment" type="button">Check payment status</button>' : ''}
          ${plans.length ? `<form id="club-upgrade-form" class="stack-form compact-form" method="post"><label for="club-upgrade-plan">Paid membership</label><select id="club-upgrade-plan" name="plan" required>${plans.map((plan) => `<option value="${escape(plan.slug)}">${escape(plan.name)} · ${escape(money(plan.price_cents, plan.currency))} / ${plan.duration_months} months</option>`).join('')}</select><p id="club-plan-description" class="small-note"></p><button type="submit" class="btn btn-primary">Continue to payment</button><p class="form-error" role="alert" hidden></p></form><p class="small-note">One payment; no automatic renewal. Renewing the same active plan extends your paid period. A higher plan starts a new paid period immediately; unused time is not credited. Payment is confirmed before access changes.</p>` : `<p>${plansResult.error ? 'Paid plans could not load. Please try again later.' : 'Paid upgrades are not available yet. Your current Club account remains available.'}</p>`}
        </section>
        <section class="panel"><p class="eyebrow">Billing</p><h3>Payment history</h3>
          ${ordersResult.error ? '<p>Payment history could not load. Please refresh to try again.</p>' : orders.length ? `<div class="club-billing-table"><table><thead><tr><th>Membership</th><th>Amount</th><th>Paid on</th></tr></thead><tbody>${orders.map((order) => `<tr><td>${escape(order.plan_name)}</td><td>${escape(money(order.amount_cents, order.currency))}</td><td>${escape(date(order.paid_at))}</td></tr>`).join('')}</tbody></table></div>` : '<p>No paid memberships yet. Membership Basic is free.</p>'}
        </section>
        <section class="panel" id="club-security"><p class="eyebrow">Security</p><h3>${passwordReturn || params.has('set_password') ? 'Set your Club password' : 'Change your Club password'}</h3>
          <form id="club-password-form" class="stack-form compact-form" method="post"><label for="club-portal-password">New password</label><input id="club-portal-password" type="password" name="newPassword" minlength="8" autocomplete="new-password" required><label for="club-portal-confirm">Confirm password</label><input id="club-portal-confirm" type="password" name="confirmPassword" minlength="8" autocomplete="new-password" required><button type="submit" class="btn btn-primary">Save Club password</button><p class="form-success" role="status" hidden></p><p class="form-error" role="alert" hidden></p></form>
        </section>
      </div></div>`;
    $('#club-logout').addEventListener('click', () => signOut().catch((error) => text($('#club-logout-error'), error.message || 'Could not sign out. Please try again.')));
    $('#club-refresh-payment')?.addEventListener('click', () => renderPortal());
    const upgradeForm = $('#club-upgrade-form');
    let checkingOut = false;
    if (upgradeForm) {
      const planInput = field(upgradeForm, 'plan');
      const describePlan = () => text($('#club-plan-description'), plans.find((plan) => plan.slug === planInput.value)?.description || '');
      planInput.addEventListener('change', describePlan);
      describePlan();
      upgradeForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (checkingOut || !upgradeForm.reportValidity()) return;
        checkingOut = true;
        const button = $('button[type="submit"]', upgradeForm);
        button.disabled = true;
        button.textContent = 'Preparing payment…';
        text($('.form-error', upgradeForm), '');
        try {
          const { data, error } = await supabase.functions.invoke('create-club-checkout', { body: { plan_slug: planInput.value } });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          const checkout = new URL(data?.url);
          if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.stripe.com') throw new Error('A valid payment link was not returned.');
          window.location.href = checkout.href;
        } catch (error) {
          text($('.form-error', upgradeForm), error.message || 'Could not start payment. Please try again.');
        } finally {
          checkingOut = false;
          button.disabled = false;
          button.textContent = 'Continue to payment';
        }
      });
    }
    const passwordForm = $('#club-password-form');
    let savingPassword = false;
    passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (savingPassword || !passwordForm.reportValidity()) return;
      text($('.form-error', passwordForm), '');
      text($('.form-success', passwordForm), '');
      if (field(passwordForm, 'newPassword').value !== field(passwordForm, 'confirmPassword').value) {
        text($('.form-error', passwordForm), 'The passwords do not match.');
        return;
      }
      const button = $('button[type="submit"]', passwordForm);
      savingPassword = true;
      button.disabled = true;
      try {
        const { error } = await supabase.auth.updateUser({ password: field(passwordForm, 'newPassword').value });
        if (error) throw error;
        passwordForm.reset();
        text($('.form-success', passwordForm), 'Your Club password has been saved.');
      } catch (error) { text($('.form-error', passwordForm), error.message || 'Could not save your password.'); }
      finally { savingPassword = false; button.disabled = false; }
    });
    if (passwordReturn || params.has('set_password')) {
      $('#club-security').scrollIntoView({ block: 'start' });
      field(passwordForm, 'newPassword').focus({ preventScroll: true });
    }
    // The return URL never grants access. Only orders written by the signed webhook count.
    if (params.get('checkout') === 'success' && !confirmed && refreshAttempt < 5) {
      setTimeout(() => {
        const editing = root.contains(document.activeElement) && document.activeElement?.closest('form');
        if (version === renderVersion && !editing && !checkingOut && !savingPassword) renderPortal(refreshAttempt + 1);
      }, 2000);
    }
  }

  window.COPKUClub = { signIn, signOut, portalDestination, sendPasswordReset };
  document.addEventListener('DOMContentLoaded', () => {
    setupRegistration().catch(() => text($('#club-registration-notice'), 'Club registration could not load. Please try again.'));
    renderPortal().catch(() => {
      const root = $('#membership-portal');
      if (root) portalError(root, 'The Club portal could not load. Please refresh to try again.');
    });
  });
})();
