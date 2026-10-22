import { escapeHTML as e, taskDates, validateImage, countdown } from './model.mjs?v=1.21';

const root = document.querySelector('#orchestra-portal');
const demo = Boolean(window.COPKU_PORTAL_DEMO);
const storageKey = name => `${demo ? 'copku-demo' : 'portal'}-${name}`;
const db = window.COPKUOrchestraClient?.() || (
  window.supabase && window.PUCO_SUPABASE_URL && window.PUCO_SUPABASE_ANON_KEY
    ? window.supabase.createClient(window.PUCO_SUPABASE_URL, window.PUCO_SUPABASE_ANON_KEY, {
      auth: { storageKey: 'copku-orchestra-auth-v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    }) : null
);
let me, members = [], tasks = [], receipts = [], notifications = [], reads = [], requests = [];
let view = 'Task', tab = 'New tasks', query = '', person = null, timer, busy = false;
let completedFilter = 'completed';
const $ = selector => root.querySelector(selector);
const $$ = selector => [...root.querySelectorAll(selector)];
const name = id => e(members.find(x => x.user_id === id)?.full_name || members.find(x => x.user_id === id)?.email || 'Member');
const kindLabel = kind => ({ rehearsal: 'Rehearsal', workload: 'Workload', information: 'Information' }[kind] || kind);
const fmt = value => {
  const d = new Date(value);
  return `${d.getFullYear()}${d.toLocaleString('en', { month: 'short' })}${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
async function result(promise) { const r = await promise; if (r.error) throw r.error; return r.data; }
const rpc = (n, args) => result(db.rpc(n, args));
function status(text, error = false) {
  const n = $('.portal-status');
  if (n) { n.textContent = text; n.className = `portal-status${error ? ' portal-error' : ''}`; }
}
async function run(fn) {
  if (busy) return;
  busy = true;
  root.setAttribute('aria-busy', 'true');
  try { await fn(); } catch (err) { status(err.message || 'Please try again.', true); }
  finally { busy = false; root.setAttribute('aria-busy', 'false'); }
}
function modal(title, html, actions = [], options = {}) {
  const d = document.createElement('dialog');
  d.className = 'portal-dialog';
  d.setAttribute('aria-label', title);
  d.innerHTML = `<button class="dialog-close" aria-label="Close">×</button><h2>${e(title)}</h2>${html}<p role="alert" class="modal-error"></p><div class="dialog-actions"></div>`;
  const footer = d.querySelector('.dialog-actions');
  if (options.cancel !== false) {
    const cancel = document.createElement('button');
    cancel.textContent = options.cancel || 'Cancel';
    cancel.onclick = () => d.close();
    footer.append(cancel);
  }
  for (const [label, fn] of actions) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = async () => {
      b.disabled = true;
      try { await fn(d); d.close(); }
      catch (err) { d.querySelector('.modal-error').textContent = err.message; }
      finally { b.disabled = false; }
    };
    footer.append(b);
  }
  d.querySelector('.dialog-close').onclick = () => d.close();
  d.addEventListener('close', () => d.remove(), { once: true });
  document.body.append(d);
  d.showModal();
  return d;
}
async function load() {
  [members, tasks, receipts, notifications, reads, requests] = await Promise.all([
    result(db.from('profiles').select('*').in('role', ['admin', 'internal']).order('full_name')),
    result(db.from('portal_tasks').select('*').order('created_at', { ascending: false })),
    result(db.from('portal_task_recipients').select('*')),
    result(db.from('portal_notifications').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false })),
    result(db.from('portal_notification_reads').select('*')),
    result(db.from('portal_chat_requests').select('*'))
  ]);
}
function frame() {
  const settingsActive = ['Settings', 'Accounts', 'Club approvals'].includes(view);
  const displayName = me.full_name || me.email;
  const nameSize = displayName.length > 12 ? 32 : 46;
  root.innerHTML = `<div class="portal-layout"><aside class="portal-sidebar"><div class="portal-name"><h2 style="--name-size:${nameSize}px" title="${e(displayName)}">${e(displayName)}</h2></div><nav aria-label="Portal sections">${['Task', 'Notification', 'Contact', 'Settings'].map(v => `<button type="button" data-view="${v}" class="${view === v || (v === 'Settings' && settingsActive) ? 'active' : ''}" ${view === v || (v === 'Settings' && settingsActive) ? 'aria-current="page"' : ''}>${v}</button>`).join('')}<button type="button" disabled title="Booking is not available yet">Booking</button><button type="button" disabled title="Game is not available yet">Game</button></nav></aside><section class="portal-content"><p class="portal-status" role="status"></p><div id="portal-view"></div></section></div>`;
  applyBackground();
  $$('[data-view]').forEach(b => b.onclick = () => run(async () => {
    view = b.dataset.view;
    tab = view === 'Task' ? (me.role === 'admin' ? 'Initiate new task' : 'New tasks') : 'New notifications';
    await load(); render();
  }));
}
function backgroundPicker() {
  return `<details class="portal-background"><summary>Background color</summary><div class="portal-background-menu"><label>Color<input type="color" id="background-color" value="${localStorage.getItem(storageKey('color')) || '#ffffff'}"></label><label>Custom image, smaller than 3 MB<input type="file" id="background-image" accept="image/png,image/jpeg,image/webp,image/gif"></label><button type="button" data-clear-background>Reset background</button></div></details>`;
}
function bindBackground() {
  const colour = $('#background-color');
  if (!colour) return;
  colour.oninput = ev => { localStorage.setItem(storageKey('color'), ev.target.value); applyBackground(); };
  $('#background-image').onchange = ev => run(async () => {
    const file = ev.target.files[0];
    validateImage(file);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { localStorage.setItem(storageKey('background'), reader.result); applyBackground(); }
      catch { status('This image could not be saved. Try a smaller image.', true); }
    };
    reader.readAsDataURL(file);
  });
  $('[data-clear-background]').onclick = () => {
    localStorage.removeItem(storageKey('background')); localStorage.removeItem(storageKey('color'));
    colour.value = '#ffffff'; applyBackground();
  };
}
function applyBackground() {
  const content = $('.portal-content');
  content.style.setProperty('--portal-color', localStorage.getItem(storageKey('color')) || '#fff');
  const image = localStorage.getItem(storageKey('background'));
  content.style.setProperty('--portal-image', image ? `url("${image}")` : 'none');
}
function tabs(items, current = tab) {
  return `<div class="portal-bar"><div class="portal-tabs" role="tablist" aria-label="${e(view)} pages">${items.map(t => `<button type="button" role="tab" aria-selected="${current === t}" data-tab="${t}" class="${current === t ? 'active' : ''}">${t}</button>`).join('')}</div>${backgroundPicker()}</div>`;
}
function settingsTabs() { return tabs(me.role === 'admin' ? ['Settings', 'Accounts', 'Club approvals'] : ['Settings'], view); }
function render() {
  frame();
  const v = $('#portal-view');
  if (view === 'Task') {
    const items = me.role === 'admin' ? ['Initiate new task', 'New tasks', 'Outstanding tasks', 'Completed tasks', 'Sent tasks'] : ['New tasks', 'Outstanding tasks', 'Completed tasks'];
    v.innerHTML = tabs(items) + `<div id="portal-panel" class="portal-panel${tab === 'Initiate new task' ? ' form-panel' : ''}"></div>`;
    if (tab === 'Initiate new task') taskForm(); else taskList();
  } else if (view === 'Notification') {
    v.innerHTML = tabs(['New notifications', 'Post a notification']) + '<div id="portal-panel" class="portal-panel"></div>';
    if (tab === 'Post a notification') notificationForm(); else notificationList();
  } else if (view === 'Contact') chatView();
  else if (view === 'Settings') settings();
  else if (view === 'Accounts') accounts();
  else if (view === 'Club approvals') clubApprovals();
  $$('[data-tab]').forEach(b => b.onclick = () => run(async () => {
    if (['Settings', 'Accounts', 'Club approvals'].includes(b.dataset.tab)) view = b.dataset.tab;
    else tab = b.dataset.tab;
    await load(); render();
  }));
  bindBackground();
}
function matches(...values) { return values.join(' ').toLowerCase().includes(query); }
function actionButton(id, action) {
  const icon = action === 'accept' ? '<path d="M4 16 13 25 28 4"/>' : '<path d="M4 4 28 28M28 4 4 28"/>';
  return `<button type="button" class="action-icon ${action}" data-action="${action}" data-id="${id}" aria-label="${action === 'accept' ? 'Accept task' : 'Decline task'}"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">${icon}</svg></button>`;
}
function taskList() {
  const sent = tab === 'Sent tasks';
  const list = tasks.filter(t => {
    const r = receipts.find(x => x.task_id === t.id && x.user_id === me.user_id);
    const inTab = sent ? t.sender === me.user_id : !t.withdrawn && r && (
      tab === 'New tasks' ? ['unseen', 'seen'].includes(r.status) :
        tab === 'Outstanding tasks' ? r.status === 'outstanding' : r.status === completedFilter
    );
    return matches(t.title, t.kind, t.body?.text) && inTab;
  });
  $('#portal-panel').innerHTML = `<h1 class="portal-vh">${e(tab)}</h1>${tab === 'Completed tasks' ? `<label class="completed-filter">Show <select id="completed-filter"><option value="completed"${completedFilter === 'completed' ? ' selected' : ''}>Completed</option><option value="declined"${completedFilter === 'declined' ? ' selected' : ''}>Declined</option></select></label>` : ''}<div class="portal-table-wrap"><table class="portal-table task-table"><thead><tr><th class="title-cell">Title</th><th>Task type</th><th>Mandatory</th><th>Duration</th><th>countdown</th><th>Action</th></tr></thead><tbody>${list.map(t => {
    const r = receipts.find(x => x.task_id === t.id && x.user_id === me.user_id);
    const action = sent ? `<button type="button" class="row-button" data-review="${t.id}">Review</button>${!t.withdrawn ? `<button type="button" class="row-button" data-action="withdraw" data-id="${t.id}">Withdraw</button>` : ''}` :
      r.status === 'outstanding' ? `<button type="button" class="row-button" data-action="complete" data-id="${t.id}">Complete</button>` :
        ['unseen', 'seen'].includes(r.status) ? actionButton(t.id, 'accept') + actionButton(t.id, 'decline') : e(r.status);
    return `<tr><td class="title-cell"><button class="task-title" data-task="${t.id}">${r?.urgent ? '<span class="urgent" aria-label="Urgent">!</span>' : ''}${e(t.title)}</button></td><td>${e(kindLabel(t.kind))}</td><td>${r ? r.mandatory ? 'Mandatory' : 'Optional' : '—'}</td><td class="duration-cell">${fmt(t.starts_at)}<br>${fmt(t.ends_at)}</td><td>${t.withdrawn ? 'Withdrawn' : countdown(t.ends_at)}</td><td class="actions-cell">${action}</td></tr>`;
  }).join('') || '<tr><td class="portal-empty" colspan="6">No tasks here.</td></tr>'}</tbody></table></div>`;
  if ($('#completed-filter')) $('#completed-filter').onchange = ev => { completedFilter = ev.target.value; taskList(); };
  $$('[data-task]').forEach(b => b.onclick = () => run(() => taskDetail(b.dataset.task)));
  $$('[data-review]').forEach(b => b.onclick = () => review(b.dataset.review));
  $$('[data-action]').forEach(b => b.onclick = () => run(() => taskAction(b.dataset.id, b.dataset.action)));
}
async function taskAction(id, action, reason = '') {
  if (action === 'decline') {
    const r = receipts.find(x => x.task_id === id && x.user_id === me.user_id);
    modal('Decline a task', `<label for="decline-reason">Reason${r.mandatory ? '<span class="portal-vh"> (required)</span>' : ''}</label><textarea id="decline-reason" ${r.mandatory ? 'required' : ''} aria-label="Reason"></textarea>`, [['Confirm', async d => {
      await rpc('portal_task_action', { p_task: id, p_action: action, p_reason: d.querySelector('textarea').value });
      await load(); render();
    }]]);
    return;
  }
  await rpc('portal_task_action', { p_task: id, p_action: action, p_reason: reason });
  await load(); render();
}
async function attachment(path, label, bucket = 'portal-files') {
  if (!path) return '';
  const d = await result(db.storage.from(bucket).createSignedUrl(path, 300));
  return `<a class="portal-attachment" href="${e(d.signedUrl)}" target="_blank" rel="noopener">${e(label || 'Download attachment')}</a>`;
}
async function taskDetail(id) {
  const t = await result(db.from('portal_tasks').select('*').eq('id', id).single());
  const r = receipts.find(x => x.task_id === id && x.user_id === me.user_id);
  if (r?.status === 'unseen') { await rpc('portal_task_action', { p_task: id, p_action: 'seen' }); r.status = 'seen'; }
  const body = t.body || {};
  const colour = /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : '#000000';
  const highlight = /^#[0-9a-f]{6}$/i.test(body.highlight) ? body.highlight : '#ffffff';
  const size = Math.max(12, Math.min(48, Number(body.size) || 24));
  const decorations = [body.underline ? 'underline' : '', body.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
  $('#portal-panel').className = 'portal-panel portal-detail';
  $('#portal-panel').innerHTML = `<button type="button" class="plain-button" id="back">Back</button><h1>${e(t.title)}</h1><p class="portal-detail-meta">${e(kindLabel(t.kind))} · ${fmt(t.starts_at)} — ${fmt(t.ends_at)} · From ${name(t.sender)}</p><p class="portal-detail-meta">UUID ${e(id)}</p><div class="portal-rich" style="color:${colour};font-size:${size}px;font-weight:${body.bold ? 'bold' : 'normal'};font-style:${body.italic ? 'italic' : 'normal'};text-decoration:${decorations}"><span style="background-color:${highlight}">${e(body.text)}</span></div>${await attachment(body.attachment_path, body.attachment_name)}<p>${t.withdrawn ? 'Withdrawn' : r ? e(r.status) : 'Sent task'}</p><div id="detail-actions"></div>`;
  $('#back').onclick = () => run(async () => { await load(); render(); });
  if (r && !t.withdrawn) for (const action of ['unseen', 'seen'].includes(r.status) ? ['accept', 'decline'] : r.status === 'outstanding' ? ['complete'] : []) {
    const button = document.createElement('button'); button.className = 'plain-button'; button.textContent = action;
    button.onclick = () => run(() => taskAction(id, action)); $('#detail-actions').append(button);
  }
}
function review(id) {
  const rows = receipts.filter(r => r.task_id === id);
  modal('Recipient status', `<table><tr><th>Member</th><th>Status</th><th>Reason</th></tr>${rows.map(r => `<tr><td>${name(r.user_id)}</td><td>${e(r.status === 'seen' ? 'unseen (opened)' : r.status)}</td><td>${e(r.reason)}</td></tr>`).join('')}</table>`, [], { cancel: 'Close' });
}
function memberGroups(list) {
  const groups = new Map();
  for (const member of list) {
    const group = member.group_name || 'Orchestra';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(member);
  }
  return [...groups];
}
function taskForm() {
  const groups = memberGroups(members);
  const recipientRows = groups.map(([group, list], index) => `<tr class="group-row"><td colspan="7">${e(group)} <input type="checkbox" data-send-group="${index}" aria-label="Send to ${e(group)}"></td></tr>${list.map(m => `<tr data-recipient="${m.user_id}" data-group="${index}"><td><input type="checkbox" class="recipient-select" aria-label="Send to ${e(m.full_name || m.email)}"></td><td>${e(m.display_id || m.user_id.slice(0, 8))}</td><td>${name(m.user_id)}</td><td>${e(m.instrument || '—')}</td><td><input type="checkbox" class="recipient-mandatory" checked aria-label="Mandatory for ${e(m.full_name || m.email)}"></td><td><input type="checkbox" class="recipient-optional" aria-label="Optional for ${e(m.full_name || m.email)}"></td><td><input type="checkbox" class="recipient-urgent" aria-label="Urgent for ${e(m.full_name || m.email)}"></td></tr>`).join('')}`).join('');
  $('#portal-panel').innerHTML = `<h1 class="portal-vh">Initiate new task</h1><form id="task-form"><div class="task-meta-row"><label for="task-title">Task title</label><input id="task-title" name="title" maxlength="200" required></div><div class="task-meta-row"><label for="task-kind">Task type</label><select id="task-kind" name="kind"><option value="rehearsal">Rehearsal</option><option value="workload">Workload</option><option value="information">Information</option></select></div><div class="task-meta-row task-duration"><span class="duration-label">Task duration</span><label for="task-start">Start</label><input id="task-start" name="startDate" type="date" required><input name="startTime" type="time" step="3600" aria-label="Start hour" title="Default start hour: 00:00"><label for="task-end">End</label><input id="task-end" name="endDate" type="date" required><input name="endTime" type="time" step="3600" aria-label="End hour" title="Default end hour: 24:00"></div><label for="task-body" class="compose-label">Content</label><div class="compose-toolbar"><input name="size" type="number" value="24" min="12" max="48" aria-label="Font size">${[['bold', '<b>B</b>'], ['italic', '<i>I</i>'], ['underline', '<u>U</u>'], ['strike', '<s>S</s>']].map(([key, label]) => `<label class="format-tool"><input type="checkbox" name="${key}" aria-label="${key}"><span>${label}</span></label>`).join('')}<label class="format-highlight"><span class="portal-vh">Text highlight color</span><input name="highlight" type="color" value="#ffffff" aria-label="Text highlight color"></label><label class="format-colour"><span style="color:#ef1d32">A</span><input name="color" type="color" value="#000000" aria-label="Text color"></label><label for="task-attachment" class="task-attachment-label">Attachment</label><input id="task-attachment" type="file" name="attachment" class="portal-vh"></div><textarea class="task-editor" id="task-body" name="body" required></textarea><output class="attachment-caption" id="task-file-name"></output><h2 class="recipients-heading">Send to members</h2><div class="portal-table-wrap"><table class="recipient-table"><thead><tr><th><label>Send to all<input type="checkbox" id="send-all"></label></th><th>ID</th><th>Name</th><th>Instrument</th><th><label>Mandatory<input type="checkbox" data-all-requirement="mandatory" checked aria-label="Make all tasks mandatory"></label></th><th><label>Optional<input type="checkbox" data-all-requirement="optional" aria-label="Make all tasks optional"></label></th><th><label>Urgent<input type="checkbox" id="all-urgent" aria-label="Make all tasks urgent"></label></th></tr></thead><tbody>${recipientRows}</tbody></table></div><div class="task-submit-row"><button type="submit">Send</button></div></form>`;
  $('#send-all').onchange = ev => { $$('.recipient-select, [data-send-group]').forEach(x => x.checked = ev.target.checked); };
  $$('[data-send-group]').forEach(b => b.onchange = () => {
    $$(`[data-group="${b.dataset.sendGroup}"] .recipient-select`).forEach(x => x.checked = b.checked);
  });
  $$('.recipient-mandatory, .recipient-optional').forEach(input => input.onchange = () => {
    if (input.checked) input.closest('tr').querySelector(input.classList.contains('recipient-mandatory') ? '.recipient-optional' : '.recipient-mandatory').checked = false;
  });
  $$('[data-all-requirement]').forEach(input => input.onchange = () => {
    const requirement = input.dataset.allRequirement;
    $$(`.recipient-${requirement}`).forEach(x => x.checked = input.checked);
    if (input.checked) {
      const other = requirement === 'mandatory' ? 'optional' : 'mandatory';
      $$(`.recipient-${other}, [data-all-requirement="${other}"]`).forEach(x => x.checked = false);
    }
  });
  $('#all-urgent').onchange = ev => $$('.recipient-urgent').forEach(x => x.checked = ev.target.checked);
  $('#task-attachment').onchange = ev => $('#task-file-name').textContent = ev.target.files[0]?.name || '';
  const form = $('#task-form');
  const styleEditor = () => {
    const fd = new FormData(form), editor = $('#task-body');
    editor.style.fontSize = `${Math.max(12, Math.min(48, Number(fd.get('size')) || 24))}px`;
    editor.style.fontWeight = fd.has('bold') ? 'bold' : 'normal';
    editor.style.fontStyle = fd.has('italic') ? 'italic' : 'normal';
    editor.style.textDecoration = [fd.has('underline') ? 'underline' : '', fd.has('strike') ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
    editor.style.color = fd.get('color');
  };
  $$('.compose-toolbar input').forEach(input => input.addEventListener('input', styleEditor));
  styleEditor();
  form.onsubmit = ev => { ev.preventDefault(); run(async () => {
    const fd = new FormData(form);
    const dates = taskDates(fd.get('startDate') + (fd.get('startTime') ? 'T' + fd.get('startTime') : ''), fd.get('endDate') + (fd.get('endTime') ? 'T' + fd.get('endTime') : ''));
    const selected = $$('[data-recipient]').filter(r => r.querySelector('.recipient-select').checked);
    if (!selected.length) throw Error('Choose at least one recipient.');
    if (selected.some(r => !r.querySelector('.recipient-mandatory').checked && !r.querySelector('.recipient-optional').checked)) throw Error('Choose Mandatory or Optional for every selected member.');
    const recipients = selected.map(r => ({ user_id: r.dataset.recipient, mandatory: r.querySelector('.recipient-mandatory').checked, urgent: r.querySelector('.recipient-urgent').checked }));
    const file = fd.get('attachment');
    const body = { text: fd.get('body'), size: fd.get('size'), color: fd.get('color'), highlight: fd.get('highlight'), bold: fd.has('bold'), italic: fd.has('italic'), underline: fd.has('underline'), strike: fd.has('strike') };
    if (file.size) { body.attachment_path = await upload(file, 'portal-files'); body.attachment_name = file.name; }
    await rpc('portal_send_task', { p_title: fd.get('title'), p_body: body, p_kind: fd.get('kind'), p_start: dates[0], p_end: dates[1], p_recipients: recipients });
    await load(); tab = 'Sent tasks'; render(); status('Task sent.');
  }); };
}
async function upload(file, bucket) {
  if (bucket === 'portal-images') validateImage(file);
  else if (file.size > 20 * 1024 * 1024) throw Error('Attachments must be at most 20 MB.');
  const path = `${me.user_id}/${crypto.randomUUID()}/${file.name.replace(/[^\w.\-]/g, '_')}`;
  await result(db.storage.from(bucket).upload(path, file));
  return path;
}
function notificationList() {
  $('#portal-panel').innerHTML = `<h1 class="portal-vh">New notifications</h1><div class="portal-table-wrap"><table class="portal-table notification-table"><thead><tr><th class="subject-cell">Subject</th><th>Author</th><th>Time</th>${me.role === 'admin' ? '<th class="portal-vh">Administration</th>' : ''}</tr></thead><tbody>${notifications.filter(n => matches(n.subject, n.body)).map(n => `<tr data-notification-row="${n.id}" class="notification-row ${reads.some(r => r.notification_id === n.id) ? 'read' : n.pinned ? 'pinned' : ''}"><td><button class="notification-title" data-notification="${n.id}">${e(n.subject)}</button></td><td>${members.find(m => m.user_id === n.author)?.role === 'admin' ? '<span class="admin-label">admin</span>' : name(n.author)}</td><td>${fmt(n.created_at)}</td>${me.role === 'admin' ? `<td><button type="button" class="row-button" data-pin="${n.id}">${n.pinned ? 'Unpin' : 'Stick on top'}</button><button type="button" class="row-button" data-delete="${n.id}">Delete</button></td>` : ''}</tr>`).join('') || `<tr><td class="portal-empty" colspan="${me.role === 'admin' ? 4 : 3}">No notifications.</td></tr>`}</tbody></table></div>`;
  $$('[data-notification]').forEach(b => b.onclick = () => run(() => notificationDetail(b.dataset.notification)));
  $$('[data-notification-row]').forEach(row => row.onclick = ev => { if (!ev.target.closest('button')) run(() => notificationDetail(row.dataset.notificationRow)); });
  $$('[data-pin]').forEach(b => b.onclick = () => run(async () => {
    await result(db.from('portal_notifications').update({ pinned: !notifications.find(n => n.id === b.dataset.pin).pinned }).eq('id', b.dataset.pin));
    await load(); render();
  }));
  $$('[data-delete]').forEach(b => b.onclick = () => modal('Delete notification', '<p>Delete this notification and its replies?</p>', [['Delete', async () => {
    await result(db.from('portal_notifications').delete().eq('id', b.dataset.delete)); await load(); render();
  }]]));
}
function notificationForm() {
  $('#portal-panel').innerHTML = '<h1 class="portal-vh">Post a notification</h1><form id="notification-form" class="notification-form"><label>Subject<input name="subject" required maxlength="200"></label><label>Content<textarea name="body" required></textarea></label><label>Image only, smaller than 3 MB<input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif"></label><button class="plain-button">Post</button></form>';
  $('#notification-form').onsubmit = ev => { ev.preventDefault(); run(async () => {
    const fd = new FormData(ev.target), file = fd.get('image');
    validateImage(file.size ? file : null);
    const image_path = file.size ? await upload(file, 'portal-images') : null;
    await result(db.from('portal_notifications').insert({ author: me.user_id, subject: fd.get('subject'), body: fd.get('body'), image_path }));
    await load(); tab = 'New notifications'; render();
  }); };
}
async function notificationDetail(id) {
  const n = await result(db.from('portal_notifications').select('*').eq('id', id).single());
  if (!reads.some(r => r.notification_id === id)) {
    await result(db.from('portal_notification_reads').insert({ notification_id: id, user_id: me.user_id }));
    reads.push({ notification_id: id, user_id: me.user_id });
  }
  const replies = await result(db.from('portal_replies').select('*').eq('notification_id', id).order('created_at'));
  let image = '';
  if (n.image_path) { const d = await result(db.storage.from('portal-images').createSignedUrl(n.image_path, 300)); image = `<img src="${e(d.signedUrl)}" alt="Notification image">`; }
  $('#portal-panel').className = 'portal-panel portal-detail';
  $('#portal-panel').innerHTML = `<button id="back" class="plain-button">Back</button><h1>${e(n.subject)}</h1><p class="portal-detail-meta">${name(n.author)} · ${fmt(n.created_at)}</p><div class="portal-rich">${e(n.body)}</div>${image}<h2>Replies</h2>${replies.map(r => `<p class="portal-detail-meta">${name(r.author)} · ${fmt(r.created_at)}</p><div class="portal-rich">${e(r.body)}</div>`).join('')}<form id="reply-form"><label>Reply<textarea name="body" required maxlength="10000"></textarea></label><button class="plain-button">Reply</button></form>`;
  $('#back').onclick = () => run(async () => { await load(); render(); });
  $('#reply-form').onsubmit = ev => { ev.preventDefault(); run(async () => {
    await result(db.from('portal_replies').insert({ notification_id: id, author: me.user_id, body: new FormData(ev.target).get('body') })); await notificationDetail(id);
  }); };
}
function chatView() {
  const eligible = members.filter(m => m.user_id !== me.user_id && matches(m.full_name, m.email));
  const groups = memberGroups(eligible);
  const memberButton = m => `<button type="button" data-person="${m.user_id}" class="${person === m.user_id ? 'selected' : ''}">${name(m.user_id)}</button>`;
  const list = groups.length === 1 && groups[0][0] === 'Orchestra' ? eligible.map(memberButton).join('') : groups.map(([group, list]) => `<details open><summary>${e(group)}</summary>${list.map(memberButton).join('')}</details>`).join('');
  $('#portal-view').innerHTML = `<div class="chat-layout"><nav class="chat-members" aria-label="Orchestra contacts">${list || '<p>No members found.</p>'}</nav><div class="chat-main"><div class="chat-topline"><h2 id="chat-heading">${person ? name(person) : 'Contact'}</h2>${backgroundPicker()}</div><div id="chat-panel"><div class="portal-panel">Select a member to chat.</div></div><div class="chat-management"><button type="button" id="manage-requests">Manage chat requests</button><button type="button" id="refresh-chat">Refresh</button></div></div></div>`;
  $('#manage-requests').onclick = manageRequests;
  $('#refresh-chat').onclick = () => run(async () => { await load(); if (person) await openChat(person); });
  $$('[data-person]').forEach(b => b.onclick = () => run(() => openChat(b.dataset.person)));
  if (!person) {
    const approved = requests.find(r => r.status === 'approved');
    if (approved) person = approved.sender === me.user_id ? approved.recipient : approved.sender;
  }
  if (person) openChat(person).catch(err => status(err.message, true));
}
async function chatAction(other, action) { await rpc('portal_chat_action', { p_person: other, p_action: action }); await load(); }
function manageRequests() {
  const d = modal('Manage chat requests', requests.map(r => {
    const other = r.sender === me.user_id ? r.recipient : r.sender;
    return `<p>${name(other)} — ${e(r.status)} ${r.sender === me.user_id ? '(sent)' : '(received)'}</p><p>${r.status === 'pending' && r.recipient === me.user_id ? `<button class="plain-button" data-approve="${other}">Approve</button>` : ''}${r.status !== 'revoked' ? `<button class="plain-button" data-revoke="${other}">Revoke</button>` : ''}</p>`;
  }).join('') || '<p>No chat requests.</p>', [], { cancel: 'Close' });
  d.querySelectorAll('[data-approve], [data-revoke]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await chatAction(b.dataset.approve || b.dataset.revoke, b.dataset.approve ? 'approve' : 'revoke'); d.close(); render(); }
    catch (err) { d.querySelector('.modal-error').textContent = err.message; b.disabled = false; }
  });
}
async function openChat(id) {
  person = id;
  $('#chat-heading').textContent = members.find(m => m.user_id === id)?.full_name || members.find(m => m.user_id === id)?.email || 'Member';
  $$('[data-person]').forEach(b => b.classList.toggle('selected', b.dataset.person === id));
  const request = requests.find(r => [r.sender, r.recipient].includes(id));
  if (!request || request.status === 'revoked') {
    $('#chat-panel').innerHTML = '<div class="portal-panel">A chat request is required before you can chat.</div>';
    modal('Send Chat request', `<p>You need to send a chat request to chat with ${name(id)}</p>`, [['Send', async () => { await chatAction(id, 'send'); status('Chat request sent.'); }]]);
    person = null;
    return;
  }
  if (request.status !== 'approved') {
    $('#chat-panel').innerHTML = '<div class="portal-panel">This chat request is pending. You can approve a received request in Manage chat requests.</div>';
    return;
  }
  const rows = await result(db.from('portal_chats').select('*').eq('request_id', request.id).order('created_at').limit(500));
  const bubbles = await Promise.all(rows.map(async m => `<div class="chat-bubble ${m.sender === me.user_id ? 'mine' : ''}" title="${name(m.sender)} · ${fmt(m.created_at)}"><p>${e(m.body)}</p>${await attachment(m.attachment_path, m.attachment_name)}</div>`));
  if (view !== 'Contact' || person !== id || !$('#chat-panel')) return;
  $('#chat-panel').innerHTML = `<div class="chat-history" aria-label="Conversation">${bubbles.join('')}</div><form id="chat-form"><label class="portal-vh" for="chat-body">Message</label><textarea id="chat-body" name="body" maxlength="10000" placeholder="type in here"></textarea><div class="chat-compose-actions"><output id="chat-file-name" class="attachment-caption"></output><label for="chat-attachment">Add attachment</label><input id="chat-attachment" type="file" name="attachment" class="portal-vh"><button type="submit">Send</button></div></form>`;
  $('#chat-attachment').onchange = ev => $('#chat-file-name').textContent = ev.target.files[0]?.name || '';
  $('#chat-form').onsubmit = ev => { ev.preventDefault(); run(async () => {
    const fd = new FormData(ev.target), file = fd.get('attachment'), body = fd.get('body').trim();
    if (!body && !file.size) throw Error('Enter a message or attachment.');
    const path = file.size ? await upload(file, 'portal-files') : null;
    await result(db.from('portal_chats').insert({ request_id: request.id, sender: me.user_id, body, attachment_path: path, attachment_name: file.size ? file.name : null }));
    await openChat(id);
  }); };
  $('.chat-history').scrollTop = $('.chat-history').scrollHeight;
}
function settings() {
  $('#portal-view').innerHTML = settingsTabs() + `<div class="portal-settings-content"><h1>Settings</h1><p>${e(me.full_name || me.email)} · ${e(me.email)}</p><h2>Change password</h2><form id="password-form"><label>New password<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label>Confirm password<input name="confirm" type="password" minlength="8" autocomplete="new-password" required></label><button>Save</button></form><p style="margin-top:30px"><button class="plain-button" type="button" id="portal-signout">Sign out</button></p></div>`;
  $('#password-form').onsubmit = ev => { ev.preventDefault(); run(async () => {
    const fd = new FormData(ev.target);
    if (fd.get('password') !== fd.get('confirm')) throw Error('Passwords do not match.');
    await result(db.auth.updateUser({ password: fd.get('password') })); ev.target.reset(); status('Password changed.');
  }); };
  $('#portal-signout').onclick = () => run(async () => { await result(db.auth.signOut()); location.href = demo ? '/portal-preview/' : '/login/'; });
}
function accounts() {
  $('#portal-view').innerHTML = settingsTabs() + `<div class="portal-settings-content"><h1>Orchestra accounts</h1><form id="account-form"><label>Name<input name="full_name" required></label><label>Email<input name="email" type="email" required></label><label>Initial password<input name="password" type="password" minlength="8" required></label><button>Create member</button></form><h2>Members</h2>${members.map(m => `<div class="account-row"><p>${name(m.user_id)} · ${e(m.email)} · ${e(m.role)}</p><div class="account-actions"><button data-reset-email="${e(m.email)}">Send reset email</button>${m.user_id !== me.user_id && m.role === 'internal' ? `<button data-remove="${m.user_id}">Delete account</button>` : ''}</div></div>`).join('')}</div>`;
  $('#account-form').onsubmit = ev => { ev.preventDefault(); run(async () => {
    await result(db.functions.invoke('create-internal-user', { body: Object.fromEntries(new FormData(ev.target)) }));
    await load(); render(); status('Member created. A verification invitation has been emailed; the member must open it before signing in.');
  }); };
  $$('[data-reset-email]').forEach(b => b.onclick = () => run(async () => {
    await result(db.auth.resetPasswordForEmail(b.dataset.resetEmail, { redirectTo: location.origin + '/portal/reset-password/' })); status('Password reset email sent.');
  }));
  $$('[data-remove]').forEach(b => b.onclick = () => modal('Delete account', `<p>Delete ${name(b.dataset.remove)} and their portal records?</p>`, [['Delete', async () => {
    await result(db.functions.invoke('delete-internal-user', { body: { user_id: b.dataset.remove } })); await load(); render();
  }]]));
}
async function clubApprovals() {
  $('#portal-view').innerHTML = settingsTabs() + '<div class="portal-settings-content" id="club-approvals-content"><p>Loading registrations…</p></div>';
  try {
    const data = await result(db.functions.invoke('portal-admin', { body: { action: 'list' } }));
    if (view !== 'Club approvals') return;
    $('#club-approvals-content').innerHTML = `<h1>Club approvals</h1><p>Review each registration. Email confirmation is required before Club access.</p>${(data.profiles || []).filter(p => p.approval_status === 'pending').map(p => `<div class="club-decision"><p>${e(p.full_name)} · ${e(p.email)}</p><button data-club="${p.user_id}" data-decision="approved">Approve</button><button data-club="${p.user_id}" data-decision="rejected">Reject</button></div>`).join('') || '<p>No pending registrations.</p>'}`;
    $$('[data-club]').forEach(b => b.onclick = () => run(async () => {
      await result(db.functions.invoke('portal-admin', { body: { action: 'decide', user_id: b.dataset.club, decision: b.dataset.decision } })); await load(); render();
    }));
  } catch (err) { status(err.message, true); }
}
async function reminders() {
  const newTasks = tasks.filter(t => !t.withdrawn && receipts.some(r => r.task_id === t.id && r.user_id === me.user_id && r.mandatory && ['unseen', 'seen'].includes(r.status)));
  const outstanding = tasks.filter(t => !t.withdrawn && receipts.some(r => r.task_id === t.id && r.user_id === me.user_id && r.status === 'outstanding'));
  const taskRows = list => list.map(t => `<button type="button" data-reminder-task="${t.id}"><span>${e(t.title)}</span><span>DDL in ${countdown(t.ends_at)}</span></button>`).join('') || '<p style="padding:8px">None</p>';
  let taskDialog;
  if (newTasks.length || outstanding.length) {
    taskDialog = modal('You have tasks to do:', `<h3 class="reminder-subheading">New tasks</h3><div class="reminder-list">${taskRows(newTasks)}</div><h3 class="reminder-subheading">Outstanding tasks:</h3><div class="reminder-list">${taskRows(outstanding)}</div>`, [['Go to Check', async () => {
      view = 'Task'; tab = newTasks.length ? 'New tasks' : 'Outstanding tasks'; render(); await taskDetail((newTasks[0] || outstanding[0]).id);
    }], ['Confirm', async () => {}]], { cancel: false });
    taskDialog.querySelectorAll('[data-reminder-task]').forEach(b => b.onclick = async () => {
      try { view = 'Task'; tab = 'New tasks'; render(); await taskDetail(b.dataset.reminderTask); taskDialog.close(); }
      catch (err) { taskDialog.querySelector('.modal-error').textContent = err.message; }
    });
  }
  const showRequest = () => {
    const request = requests.find(r => r.recipient === me.user_id && r.status === 'pending');
    if (request) modal('Chat request', `<p>${name(request.sender)} has sent you a chat request</p>`, [['Approve', async () => { await chatAction(request.sender, 'approve'); render(); }]]);
  };
  if (taskDialog) taskDialog.addEventListener('close', showRequest, { once: true }); else showRequest();
}
async function init() {
  try {
    if (!db) throw Error('Supabase is not configured. Follow the included Supabase setup guide.');
    const { user } = await result(db.auth.getUser());
    if (!user) { location.href = '/login/?account=orchestra'; return; }
    me = await result(db.from('profiles').select('*').eq('user_id', user.id).single());
    if (!['admin', 'internal'].includes(me.role)) throw Error('An orchestra account is required.');
    let bridgeError = '';
    if (me.role === 'admin') {
      try { await result(db.functions.invoke('portal-admin', { body: { action: 'list' } })); }
      catch { bridgeError = 'Club approvals could not synchronize. Check the Club connection in Settings.'; }
    }
    await load();
    tab = me.role === 'admin' ? 'Initiate new task' : 'New tasks';
    render();
    if (bridgeError) status(bridgeError, true);
    await reminders();
    let idle;
    const resetIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(async () => { await db.auth.signOut(); location.href = demo ? '/portal-preview/' : '/login/'; }, 30 * 60 * 1000);
    };
    ['click', 'keydown', 'touchstart', 'scroll'].forEach(event => window.addEventListener(event, resetIdle, { passive: true }));
    resetIdle();
    timer = setInterval(async () => {
      if (document.hidden || busy || document.querySelector('dialog[open]')) return;
      try {
        const { user } = await result(db.auth.getUser());
        if (!user) { clearInterval(timer); location.href = demo ? '/portal-preview/' : '/login/'; return; }
        await load();
        if (view === 'Contact' && person && !$('#chat-body')?.value && !$('#chat-attachment')?.files.length) await openChat(person);
      } catch (err) { status('Refresh failed: ' + err.message, true); }
    }, 15000);
  } catch (err) {
    root.innerHTML = `<div class="portal-layout"><aside class="portal-sidebar"><div class="portal-name"><h2>Name</h2></div><nav><button>Task</button><button>Notification</button><button>Contact</button><button>Settings</button><button disabled>Booking</button><button disabled>Game</button></nav></aside><section class="portal-content"><div class="portal-panel"><p class="portal-error" role="alert">${e(err.message)}</p><p>Check the Supabase setup, then refresh.</p><a href="/login/?account=orchestra">Orchestra login</a></div></section></div>`;
  }
}
const openSearch = document.querySelector('#open-portal-search');
const searchPanel = document.querySelector('#portal-search-panel');
function setSearch(open) {
  searchPanel.hidden = !open;
  openSearch.setAttribute('aria-expanded', String(open));
  if (open) document.querySelector('#portal-search').focus(); else openSearch.focus();
}
openSearch.onclick = () => setSearch(true);
document.querySelector('#close-portal-search').onclick = () => setSearch(false);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !searchPanel.hidden) setSearch(false); });
document.querySelector('.portal-search').onsubmit = ev => {
  ev.preventDefault(); query = document.querySelector('#portal-search').value.trim().toLowerCase();
  if (me) render(); setSearch(false);
};
init();
