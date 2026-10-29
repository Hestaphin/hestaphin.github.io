(function () {
  const SESSION_MINUTES = 30;
  const INTERNAL_BUCKET = 'internal-files';

  const state = {
    supabase: null,
    activityBound: false,
    logoutTimer: null,
    authReady: false,
  };

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const fmt = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  function setText(el, text, hidden = false) {
    if (!el) return;
    el.textContent = text || '';
    el.hidden = hidden;
  }

  function showError(form, text) {
    const error = form?.querySelector('.form-error, .auth-error');
    if (error) {
      error.hidden = false;
      error.textContent = text;
    }
  }

  function clearFormState(form) {
    if (!form) return;
    form.querySelectorAll('.form-error, .auth-error, .form-success').forEach((node) => {
      node.hidden = true;
      node.textContent = '';
    });
  }

  function setupMenu() {
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('.main-nav');
    if (menuToggle && nav) {
      menuToggle.addEventListener('click', () => nav.classList.toggle('show'));
    }
  }

  async function setupContactForm() {
    const form = document.querySelector('.contact-form[data-ajax="true"]');
    if (!form) return;
    const notice = document.querySelector('.form-success');
    const errorBox = document.querySelector('.form-error');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (notice) notice.hidden = true;
      if (errorBox) errorBox.hidden = true;
      const button = form.querySelector('button[type="submit"]');
      const original = button ? button.textContent : '';
      if (button) {
        button.disabled = true;
        button.textContent = 'Sending...';
      }
      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error('Submission failed');
        form.reset();
        if (notice) {
          notice.hidden = false;
          notice.textContent = 'Sent successfully.';
        }
      } catch (error) {
        if (errorBox) {
          errorBox.hidden = false;
          errorBox.textContent = 'Message could not be sent right now. Please email admin@pkuco.org directly.';
        }
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = original || 'Send Message';
        }
      }
    });
  }

  function getSupabase() {
    if (state.supabase) return state.supabase;
    if (!window.supabase || !window.PUCO_SUPABASE_URL || !window.PUCO_SUPABASE_ANON_KEY) {
      return null;
    }
    state.supabase = window.supabase.createClient(window.PUCO_SUPABASE_URL, window.PUCO_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Orchestra never consumes Club email confirmation or recovery tokens.
        storageKey: 'copku-orchestra-auth-v1',
        detectSessionInUrl: false,
      },
    });
    return state.supabase;
  }

  window.COPKUOrchestraClient = getSupabase;

  async function getSession() {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session || null;
  }

  async function getCurrentUser() {
    const session = await getSession();
    return session?.user || null;
  }

  async function signOutAndRedirect() {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.auth.signOut();
    }
    window.location.href = '/login/';
  }

  function resetAutoLogoutCountdown() {
    clearTimeout(state.logoutTimer);
    state.logoutTimer = setTimeout(async () => {
      alert('You have been logged out due to inactivity.');
      await signOutAndRedirect();
    }, SESSION_MINUTES * 60 * 1000);
  }

  function bindSessionWatch() {
    if (state.activityBound) return;
    state.activityBound = true;
    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((eventName) => {
      window.addEventListener(eventName, resetAutoLogoutCountdown, { passive: true });
    });
    resetAutoLogoutCountdown();
  }

  function requireSupabaseMessage(container, text) {
    if (!container) return;
    container.innerHTML = `<div class="panel"><h3>Supabase is not configured yet.</h3><p>${text}</p></div>`;
  }

  async function fetchMyProfile() {
    const supabase = getSupabase();
    const user = await getCurrentUser();
    if (!supabase || !user) return null;
    const { data, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function signInOrchestra(supabase, identifier, password) {
    const { requestOrchestraSession } = await import('/login/orchestra-auth.mjs?v=1.33');
    const session = await requestOrchestraSession({supabaseUrl:window.PUCO_SUPABASE_URL,publishableKey:window.PUCO_SUPABASE_ANON_KEY,identifier,password});
    const saved = await supabase.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
    if (saved.error) throw saved.error;
  }

  async function setupInternalLogin() {
    const form = $('#internal-login-form');
    if (!form) return;
    const supabase = getSupabase();
    if (!supabase) {
      showError(form, 'Supabase is not configured yet. Please add your project URL and anon key in config.js.');
      return;
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFormState(form);
      const button = $('button[type="submit"]', form);
      const original = button?.textContent || 'Login';
      if (button) {
        button.disabled = true;
        button.textContent = 'Logging in...';
      }
      try {
        const email = form.email.value.trim().toLowerCase();
        const password = form.password.value;
        window.location.href = await signInToPortal('orchestra', email, password);
      } catch (error) {
        showError(form, error.message || 'Incorrect email or password.');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = original;
        }
      }
    });
  }

  // One visual chooser, two independent authentication systems.
  async function signInToPortal(account, email, password) {
    if (account === 'club') {
      if (!window.COPKUClub) throw new Error('Club login is unavailable right now. Please try again.');
      return window.COPKUClub.signIn(email, password);
    }
    if (account !== 'orchestra') throw new Error('Choose an account type.');
    const supabase = getSupabase();
    if (!supabase) throw new Error('Orchestra login is unavailable right now. Please try again.');
    const { withLoginDeadline } = await import('/login/orchestra-auth.mjs?v=1.33');
    return withLoginDeadline(async () => {
      await signInOrchestra(supabase, email, password);
      try {
        const profile = await fetchMyProfile();
        if (profile && ['admin', 'internal'].includes(profile.role)) return '/portal/internal/';
        throw new Error('This account is not an orchestra account.');
      } catch (error) {
        await supabase.auth.signOut({scope:'local'});
        throw error;
      }
    });
  }
  async function getPortalDestination(account) {
    if (account === 'club') return window.COPKUClub?.portalDestination() || null;
    try {
      const profile = await fetchMyProfile();
      return profile && ['admin', 'internal'].includes(profile.role) ? '/portal/internal/' : null;
    } catch { return null; }
  }
  window.COPKUAuth = { signInToPortal, getPortalDestination };

  async function uploadInternalAttachment(file, messageId) {
    const supabase = getSupabase();
    const path = `${messageId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage.from(INTERNAL_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;
    return path;
  }

  async function getSignedFileUrl(path) {
    const supabase = getSupabase();
    const { data, error } = await supabase.storage.from(INTERNAL_BUCKET).createSignedUrl(path, 60 * 10);
    if (error) throw error;
    return data?.signedUrl || '';
  }

  async function renderInternalPortal() {
    const root = $('#internal-portal');
    if (!root || root.dataset.portalV2) return;
    const supabase = getSupabase();
    if (!supabase) {
      requireSupabaseMessage(root, 'Open site/config.js, fill in your Supabase URL and anon key, then refresh the page.');
      return;
    }

    const user = await getCurrentUser();
    if (!user) {
      window.location.href = '/login/?account=orchestra';
      return;
    }

    let me;
    try {
      me = await fetchMyProfile();
    } catch (error) {
      requireSupabaseMessage(root, error.message || 'Could not load profile.');
      return;
    }

    if (!me || !['admin', 'internal'].includes(me.role)) {
      await supabase.auth.signOut();
      window.location.href = '/login/?account=orchestra';
      return;
    }

    bindSessionWatch();

    const accountsQuery = supabase
      .from('profiles')
      .select('*')
      .in('role', ['admin', 'internal'])
      .order('created_at', { ascending: true });
    const messagesQuery = supabase
      .from('internal_messages')
      .select('*')
      .order('created_at', { ascending: false });

    const [{ data: accounts = [], error: accountsError }, { data: inbox = [], error: messagesError }] = await Promise.all([
      accountsQuery,
      messagesQuery,
    ]);

    if (accountsError) {
      requireSupabaseMessage(root, accountsError.message);
      return;
    }
    if (messagesError) {
      requireSupabaseMessage(root, messagesError.message);
      return;
    }

    const downloadableMessages = await Promise.all(
      inbox.map(async (item) => {
        if (!item.attachment_path) return { ...item, signedUrl: '' };
        try {
          const signedUrl = await getSignedFileUrl(item.attachment_path);
          return { ...item, signedUrl };
        } catch {
          return { ...item, signedUrl: '' };
        }
      })
    );

    root.innerHTML = `
      <div class="dashboard-shell">
        <aside class="dashboard-sidebar panel">
          <span class="tag">${me.role === 'admin' ? 'Administrator' : 'Internal member'}</span>
          <h2>${me.full_name || me.email}</h2>
          <p>${me.email}</p>
          <p class="small-note">Automatic logout after ${SESSION_MINUTES} minutes of inactivity.</p>
          <button class="btn btn-secondary logout-btn" type="button">Logout</button>
        </aside>
        <div class="dashboard-main">
          <section class="panel">
            <p class="eyebrow">Inbox</p>
            <h3>Files and notices from the administrator</h3>
            <div class="inbox-list">
              ${downloadableMessages.length ? downloadableMessages.map((item) => `
                <article class="message-card">
                  <div class="message-top">
                    <strong>${escapeHtml(item.title || 'Untitled')}</strong>
                    <span>${fmt(item.created_at)}</span>
                  </div>
                  <p>${escapeHtml(item.body || '')}</p>
                  ${item.signedUrl ? `<div class="attachment-box">${item.attachment_type && item.attachment_type.startsWith('image/') ? `<img src="${item.signedUrl}" alt="${escapeHtml(item.attachment_name || 'attachment')}" class="attachment-preview" />` : ''}<a class="text-link" href="${item.signedUrl}" download="${escapeHtml(item.attachment_name || 'attachment')}">Download ${escapeHtml(item.attachment_name || 'attachment')}</a></div>` : ''}
                  <p class="small-note">From: ${escapeHtml(item.from_email || 'PUCO admin')}</p>
                </article>
              `).join('') : '<p>No files or messages yet.</p>'}
            </div>
          </section>

          <section class="panel">
            <p class="eyebrow">Security</p>
            <h3>Change your password</h3>
            <form id="change-password-form" class="stack-form compact-form">
              <input type="password" name="newPassword" placeholder="New password" minlength="8" required />
              <button class="btn btn-primary" type="submit">Update password</button>
              <p class="form-success small-note" hidden></p>
              <p class="form-error small-note" hidden></p>
            </form>
          </section>

          ${me.role === 'admin' ? `
          <section class="panel">
            <p class="eyebrow">Create account</p>
            <h3>Add a new internal member</h3>
            <form id="create-internal-account" class="stack-form compact-form">
              <input type="text" name="name" placeholder="Member name" required />
              <input type="email" name="email" placeholder="Initial username / email" required />
              <input type="text" name="password" placeholder="Initial password" minlength="8" required />
              <button class="btn btn-primary" type="submit">Create internal account</button>
              <p class="form-success small-note" hidden></p>
              <p class="form-error small-note" hidden></p>
            </form>
          </section>

          <section class="panel">
            <p class="eyebrow">Internal accounts</p>
            <h3>Manage members</h3>
            <div class="account-table">
              ${accounts.map((item) => `
                <div class="account-row">
                  <div>
                    <strong>${escapeHtml(item.full_name || item.email)}</strong>
                    <p>${escapeHtml(item.email)}</p>
                  </div>
                  <div class="account-actions">
                    ${item.role === 'admin' ? '<span class="tag">Admin</span>' : '<span class="tag tag-neutral">Member</span>'}
                    ${item.user_id !== me.user_id ? `<button class="btn btn-secondary btn-sm delete-account" data-user-id="${item.user_id}" data-email="${escapeHtml(item.email)}" type="button">Delete</button>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </section>

          <section class="panel">
            <p class="eyebrow">Send updates</p>
            <h3>Send text, image, or file to members</h3>
            <form id="send-message-form" class="stack-form compact-form" enctype="multipart/form-data">
              <input type="text" name="title" placeholder="Title" required />
              <textarea name="body" rows="5" placeholder="Message"></textarea>
              <div class="recipient-box">
                <label class="checkline"><input type="checkbox" name="broadcast" value="yes" /> Broadcast to all internal members</label>
                <div class="recipient-grid">
                  ${accounts.filter((item) => item.role === 'internal').map((item) => `<label class="checkline"><input type="checkbox" name="recipients" value="${item.user_id}" /> ${escapeHtml(item.full_name || item.email)}</label>`).join('') || '<p class="small-note">Create members first to choose recipients.</p>'}
                </div>
              </div>
              <input type="file" name="attachment" />
              <button class="btn btn-primary" type="submit">Send to selected members</button>
              <p class="form-success small-note" hidden></p>
              <p class="form-error small-note" hidden></p>
            </form>
          </section>` : ''}
        </div>
      </div>
    `;

    $$('.logout-btn', root).forEach((btn) => btn.addEventListener('click', signOutAndRedirect));

    const passwordForm = $('#change-password-form', root);
    passwordForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFormState(passwordForm);
      try {
        const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword.value });
        if (error) throw error;
        passwordForm.reset();
        setText($('.form-success', passwordForm), 'Password updated successfully.', false);
      } catch (error) {
        setText($('.form-error', passwordForm), error.message || 'Could not update password.', false);
      }
    });

    const createForm = $('#create-internal-account', root);
    createForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFormState(createForm);
      const button = $('button[type="submit"]', createForm);
      const original = button?.textContent || 'Create internal account';
      if (button) {
        button.disabled = true;
        button.textContent = 'Creating...';
      }
      try {
        const response = await supabase.functions.invoke('create-internal-user', {
          body: {
            full_name: createForm.name.value.trim(),
            email: createForm.email.value.trim().toLowerCase(),
            password: createForm.password.value,
          },
        });
        if (response.error) throw response.error;
        createForm.reset();
        setText($('.form-success', createForm), 'Internal account created.', false);
        await renderInternalPortal();
      } catch (error) {
        setText($('.form-error', createForm), error.message || 'Could not create account.', false);
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = original;
        }
      }
    });

    $$('.delete-account', root).forEach((btn) => btn.addEventListener('click', async () => {
      const email = btn.dataset.email || 'this account';
      if (!window.confirm(`Delete ${email}? This cannot be undone.`)) return;
      try {
        const response = await supabase.functions.invoke('delete-internal-user', {
          body: { user_id: btn.dataset.userId },
        });
        if (response.error) throw response.error;
        await renderInternalPortal();
      } catch (error) {
        alert(error.message || 'Could not delete account.');
      }
    }));

    const sendForm = $('#send-message-form', root);
    sendForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFormState(sendForm);
      const button = $('button[type="submit"]', sendForm);
      const original = button?.textContent || 'Send to selected members';
      if (button) {
        button.disabled = true;
        button.textContent = 'Sending...';
      }
      try {
        const broadcast = $('input[name="broadcast"]', sendForm).checked;
        const recipientIds = $$('input[name="recipients"]:checked', sendForm).map((input) => input.value);
        if (!broadcast && recipientIds.length === 0) {
          throw new Error('Choose at least one recipient or enable broadcast.');
        }
        const messageId = crypto.randomUUID();
        const file = $('input[name="attachment"]', sendForm).files?.[0] || null;
        let attachmentPath = null;
        if (file) {
          attachmentPath = await uploadInternalAttachment(file, messageId);
        }
        const { error: insertError } = await supabase.from('internal_messages').insert({
          id: messageId,
          title: sendForm.title.value.trim(),
          body: sendForm.body.value.trim(),
          from_user_id: me.user_id,
          from_email: me.email,
          broadcast,
          attachment_path: attachmentPath,
          attachment_name: file?.name || null,
          attachment_type: file?.type || null,
        });
        if (insertError) throw insertError;

        if (!broadcast && recipientIds.length) {
          const recipientRows = recipientIds.map((userId) => ({ message_id: messageId, user_id: userId }));
          const { error: recipientsError } = await supabase.from('internal_message_recipients').insert(recipientRows);
          if (recipientsError) throw recipientsError;
        }
        sendForm.reset();
        setText($('.form-success', sendForm), 'Message sent to selected members.', false);
        await renderInternalPortal();
      } catch (error) {
        setText($('.form-error', sendForm), error.message || 'Could not send message.', false);
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = original;
        }
      }
    });
  }

  function escapeHtml(text) {
    return String(text ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  async function hydrateAuthNav() {
    const [orchestra, club] = await Promise.all([
      getPortalDestination('orchestra'), getPortalDestination('club'),
    ]);
    const clubPage = /^\/portal\/membership\//.test(window.location.pathname) || /^\/opportunities\/club\//.test(window.location.pathname);
    const orchestraPage = /^\/portal\/internal\//.test(window.location.pathname);
    let target = orchestra && club ? '/login/' : orchestra || club || '/login/';
    if (clubPage) target = club || '/login/?account=club';
    if (orchestraPage) target = orchestra || '/login/?account=orchestra';
    $$('.login-link').forEach((link) => {
      link.textContent = target.startsWith('/portal/') ? 'Portal' : orchestra && club ? 'Portals' : 'Login';
      link.href = target;
    });
  }
  async function bootSupabaseAwarePages() {
    await hydrateAuthNav();
    await setupInternalLogin();
    await renderInternalPortal();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    setupMenu();
    setupContactForm();
    await bootSupabaseAwarePages();
  });
})();
