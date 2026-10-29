import {createBookingController} from './booking-ui.mjs?v=1.37';
import {portalPager, readAllRows} from './pagination.mjs?v=1.35';
import {taskRecurrence, recurrenceLabel} from './recurrence-model.mjs?v=1.35';
import { escapeHTML as e, taskDates, validateImage, validateNotificationFiles, isPreviewImage, countdown } from './model.mjs?v=1.35';

import { bindPortalSearch, portalSearchRecords, searchPortal, sortEvents, groupByMonth } from './search.mjs?v=1.35';

import { invokeService } from './service.mjs?v=1.35';
import { DEPARTMENTS, CLASSIFICATIONS, MEMBER_STATUSES, RANKS, occupationsFor, instrumentsFor, validateMember, titleCase, isTrainingRank, MEMBER_FILTER_FIELDS, filterMembers } from './member-fields.mjs?v=1.35';

import { unseenChatRequests, contactUnreadCounts } from './live-state.mjs?v=1.35';

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
let taskSeries = [];
let view = 'Personal page', tab = 'New tasks', query = '', person = null, timer, busy = false;
let completedFilter = 'all', replyNotices = [], unreadChats = [], noticeOpen = false, currentNotification = null, chatLimit = 500, contactQuery = '';
let liveChannel, liveTimer, liveRefreshing=false, liveAgain=false;
let bookingController=null,bookingTab='Room';
let applicationTab='Orchestra applications',clubFilter='all',clubOffset=0,orchestraFilter='all',orchestraOffset=0,applicationRequest=0;
const alertedRequests=new Set(),accountFilters=Object.fromEntries(MEMBER_FILTER_FIELDS.map(key=>[key,[]]));
const money = (amount,currency='usd') => new Intl.NumberFormat(window.COPKU_I18N?.language==='cn'?'zh-CN':'en-US',{style:'currency',currency:String(currency).toUpperCase()}).format(Number(amount||0)/100);
const $ = selector => root.querySelector(selector);
const $$ = selector => [...root.querySelectorAll(selector)];
const name = id => e(members.find(x => x.user_id === id)?.full_name || members.find(x => x.user_id === id)?.email || 'Member');
const kindLabel = kind => ({ rehearsal: 'Rehearsal', workload: 'Workload', information: 'Information' }[kind] || kind);
const fmt = value => {
  const d = new Date(value);
  return `${d.getFullYear()}${d.toLocaleString('en', { month: 'short' })}${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
async function result(promise) { const r = await promise; if (r.error) throw r.error; return r.data; }
const callService = (name, body) => invokeService(db, name, body);
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
  d.className = 'portal-dialog' + (options.className ? ' ' + options.className : '');
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
async function load({indicators=true}={}) {
  [members, tasks, receipts, notifications, reads, requests, replyNotices, unreadChats, taskSeries] = await Promise.all([
    readAllRows(() => db.from('profiles').select('*').in('role', ['admin', 'internal']).order('full_name').order('user_id')),
    readAllRows(() => db.from('portal_tasks').select('*').order('created_at', { ascending: false }).order('id')),
    readAllRows(() => db.from('portal_task_recipients').select('*').order('task_id').order('user_id')),
    readAllRows(() => db.from('portal_notifications').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).order('id')),
    readAllRows(() => db.from('portal_notification_reads').select('*').order('notification_id').order('user_id')),
    readAllRows(() => db.from('portal_chat_requests').select('*').order('id')),
    readAllRows(() => db.from('portal_reply_notices').select('*').is('read_at',null).order('created_at',{ascending:false}).order('id')),
    rpc('portal_chat_unread'),
    readAllRows(() => db.from('portal_task_series').select('id,repeat_unit,repeat_every,active,next_at').order('id'))
  ]);
  if (me) me = members.find(m => m.user_id === me.user_id) || me;
  if(indicators)updateIndicators();
}
function frame() {
  const settingsActive = ['Settings', 'Accounts', 'Application', 'Shop orders'].includes(view);
  const displayName = me.full_name || me.email;
  const nameSize = displayName.length > 12 ? 28 : 40;
  document.body.classList.toggle('portal-chat-open', view === 'Contact');
  root.innerHTML = `<div class="portal-layout"><aside class="portal-sidebar"><div class="portal-name"><h2 data-user-content style="--name-size:${nameSize}px" title="${e(displayName)}"><button type="button" id="portal-personal-link" class="portal-name-link" data-user-content>${e(displayName)}</button></h2>${probationaryTag(me)}<button type="button" id="portal-signout" class="portal-logout">Log out</button></div><nav aria-label="Portal sections">${['Task', 'Notification', 'Contact', 'Settings', 'Booking'].map(v => `<button type="button" data-view="${v}" class="${view === v || (v === 'Settings' && settingsActive) ? 'active' : ''}" ${view === v || (v === 'Settings' && settingsActive) ? 'aria-current="page"' : ''}>${v}${['Task','Notification','Contact'].includes(v)?badge(0,'badge-'+v.toLowerCase()):''}</button>`).join('')}<a class="portal-email-link" href="${demo?'https://copku-private-email.neonlake16.chatgpt.site/demo/':e(window.COPKU_EMAIL_URL||'https://email.pkuco.org/')}">Email</a><button type="button" disabled title="Game is not available yet">Game</button></nav></aside><section class="portal-content"><p class="portal-status" role="status"></p><div id="portal-view"></div></section></div>`;
  applyBackground();
  $('#portal-personal-link').onclick=()=>run(async()=>{await load();view='Personal page';render();});
  $('#portal-signout').onclick = () => run(async () => { await result(db.auth.signOut()); location.href = demo ? '/portal-preview/' : '/login/'; });
  $$('[data-view]').forEach(b => b.onclick = () => run(async () => {
    view = b.dataset.view;
    tab = view === 'Task' ? (me.role === 'admin' ? 'Initiate new task' : 'New tasks') : 'New notifications';
    await load(); render();
  }));
}
function backgroundPicker() {
  return `<details class="portal-background"><summary>Background color</summary><div class="portal-background-menu"><label>Color<input type="color" id="background-color" value="${localStorage.getItem(storageKey('color')) || '#ffffff'}"></label><label>Custom image, smaller than 3 MB<input type="file" id="background-image" accept="image/png,image/jpeg,image/webp,image/gif"></label><label class="background-opacity-label">Image transparency <output id="background-transparency-value">${backgroundTransparency()}%</output><input id="background-transparency" type="range" min="0" max="100" step="1" value="${backgroundTransparency()}" aria-label="Image transparency"></label><button type="button" data-clear-background>Reset background</button></div></details>`;
}
function backgroundTransparency() { const value=Number(localStorage.getItem(storageKey('transparency'))||0);return Number.isFinite(value)?Math.min(100,Math.max(0,value)):0; }
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
  $('#background-transparency').oninput = ev => { localStorage.setItem(storageKey('transparency'),ev.target.value);$('#background-transparency-value').textContent=ev.target.value+'%';applyBackground(); };
  $('[data-clear-background]').onclick = () => {
    localStorage.removeItem(storageKey('background')); localStorage.removeItem(storageKey('color'));
    localStorage.removeItem(storageKey('transparency'));$('#background-transparency').value='0';$('#background-transparency-value').textContent='0%';
    colour.value = '#ffffff'; applyBackground();
  };
}
function applyBackground() {
  const content = $('.portal-content');
  content.style.setProperty('--portal-color', localStorage.getItem(storageKey('color')) || '#fff');
  const image = localStorage.getItem(storageKey('background'));
  content.style.setProperty('--portal-image', image ? `url("${image}")` : 'none');
  content.style.setProperty('--portal-image-opacity',String(1-backgroundTransparency()/100));
}
function tabs(items, current = tab) {
  return `<div class="portal-bar"><div class="portal-tabs" role="tablist" aria-label="${e(view)} pages">${items.map(t => `<button type="button" role="tab" aria-selected="${current === t}" data-tab="${t}" class="${current === t ? 'active' : ''}">${t}</button>`).join('')}</div>${backgroundPicker()}</div>`;
}
function settingsTabs() { return tabs(me.role === 'admin' ? ['Settings', 'Accounts', 'Application', 'Shop orders'] : ['Settings'], view); }
function render() {
  bookingController?.destroy();bookingController=null;
  frame();
  const v = $('#portal-view');
  if (view === 'Personal page') personalPage();
  else if (view === 'Task') {
    const items = me.role === 'admin' ? ['Initiate new task', 'New tasks', 'Outstanding tasks', 'Completed tasks', 'Sent tasks'] : ['New tasks', 'Outstanding tasks', 'Completed tasks'];
    v.innerHTML = tabs(items) + `<div id="portal-panel" class="portal-panel${tab === 'Initiate new task' ? ' form-panel' : ''}"></div>`;
    if (tab === 'Initiate new task') taskForm(); else taskList();
  } else if (view === 'Notification') {
    v.innerHTML = tabs(['New notifications', 'Post a notification']) + '<div id="portal-panel" class="portal-panel"></div>';
    if (tab === 'Post a notification') notificationForm(); else notificationList();
  } else if (view === 'Contact') chatView();
  else if (view === 'Settings') settings();
  else if (view === 'Accounts') accounts();
  else if (view === 'Application') applications();
  else if (view === 'Shop orders') shopOrders();
  else if (view === 'Booking') bookingPage();
  $$('[data-tab]').forEach(b => b.onclick = () => run(async () => {
    if (['Personal page','Settings', 'Accounts', 'Application', 'Shop orders'].includes(b.dataset.tab)) view = b.dataset.tab;
    else if(view==='Booking')bookingTab=b.dataset.tab;
    else tab = b.dataset.tab;
    await load(); render();
  }));
  bindBackground();
  updateIndicators();
  showChatRequestToast();
}
function bookingPage() {
 $('#portal-view').innerHTML=tabs(['Room','Instrument','Equipment','Transportation'],bookingTab)+'<div id="booking-content"></div>';
 bookingController=createBookingController({container:$('#booking-content'),category:bookingTab,invoke:body=>callService('portal-booking',body),member:()=>me,members:()=>members,status,modal,uploadFile:file=>upload(file,'portal-resource-files')});
}
function bindFiles(input, output, multiple = false) {
 let selected = [];
 function draw() {
  output.innerHTML=selected.map((file,i)=>`<span class="selected-file"><span>${e(file.name)} · ${(file.size/1048576).toFixed(2)} MB</span><button type="button" data-remove-file="${i}" aria-label="Remove ${e(file.name)}">Remove</button></span>`).join('');
  output.querySelectorAll('[data-remove-file]').forEach(b=>b.onclick=()=>{selected.splice(Number(b.dataset.removeFile),1);draw();});
 }
 input.onchange=()=>{try{const picked=Array.from(input.files||[]);selected=validateNotificationFiles(multiple?[...selected,...picked]:picked.slice(0,1));draw();}catch(err){status(err.message,true);}finally{input.value='';}};
 return {get files(){return selected;},clear(){selected=[];draw();}};
}
function badge(value, id = '') { return `<span class="portal-badge" ${id?`id="${id}"`:''} ${value?'':'hidden'} aria-label="${value} unread">${value>99?'99+':value||''}</span>`; }
function probationaryTag(member) {
 return member?.member_status==='probationary'?`<span class="member-status-tag" data-probationary-tag>${e(window.COPKU_I18N?.translate('Probationary')||'Probationary')}</span>`:'';
}
function memberLabel(id) {const member=members.find(m=>m.user_id===id);return `<span data-user-content>${name(id)}</span>${probationaryTag(member)}`;}
function activeChatPerson() {return view==='Contact'&&person&&!root.hidden&&!document.hidden&&(document.hasFocus?.()??true)&&$('#chat-form')&&$('#chat-panel')?.dataset.person===person?person:null;}
function updateIndicators() {
 const newTasks=tasks.filter(t=>!t.withdrawn&&receipts.some(r=>r.task_id===t.id&&r.user_id===me?.user_id&&['unseen','seen'].includes(r.status))).length;
 const chatCounts=contactUnreadCounts(unreadChats,requests,me?.user_id,activeChatPerson());
 const counts={task:newTasks,notification:replyNotices.length,contact:chatCounts.total};
 for(const [key,count]of Object.entries(counts)){const b=$('#badge-'+key);if(b){b.textContent=count>99?'99+':String(count);b.hidden=!count;b.setAttribute('aria-label',key==='contact'?`${chatCounts.messages} unread messages, ${chatCounts.requests} new chat requests`:`${count} ${key==='task'?'new tasks':'reply notices'}`);}}
 $$('[data-person]').forEach(button=>{const count=chatCounts.byPerson.get(button.dataset.person)||0,b=button.querySelector('.portal-badge');if(b){b.textContent=count>99?'99+':String(count);b.hidden=!count;b.setAttribute('aria-label',`${count} unread messages or chat requests`);}});
 renderNoticeDock();
}
function showChatRequestToast() {
 if(!me||root.hidden||document.hidden||!(document.hasFocus?.()??true)||document.querySelector('dialog[open]'))return;
 const unread=unseenChatRequests(requests,me.user_id);
 const existing=$('#chat-request-toast');
 if(existing){if(unread.some(r=>r.id===existing.dataset.request))return;existing.remove();}
 const request=unread.find(r=>!alertedRequests.has(r.id+':'+r.created_at));if(!request)return;
 alertedRequests.add(request.id+':'+request.created_at);
 const toast=document.createElement('aside');toast.id='chat-request-toast';toast.className='chat-request-toast';toast.dataset.request=request.id;toast.setAttribute('role','status');
 toast.innerHTML=`<p><span data-user-content>${name(request.sender)}</span> <span>has sent you a chat request</span></p><div><button type="button" data-review-request>Review request</button><button type="button" data-later-request>Later</button></div>`;
 root.append(toast);
 toast.querySelector('[data-later-request]').onclick=()=>toast.remove();
 toast.querySelector('[data-review-request]').onclick=()=>run(()=>reviewChatRequest(request.id));
}
async function markChatRequestsSeen(rows) {
 for(const r of rows.filter(r=>r.recipient===me.user_id&&r.status==='pending'&&!r.recipient_seen_at)){
  const marked=await rpc('portal_mark_chat_request_seen',{p_request:r.id,p_created_at:r.created_at});
  if(marked)r.recipient_seen_at=new Date().toISOString();
 }
 updateIndicators();
}
async function reviewChatRequest(id) {
 const request=requests.find(r=>r.id===id&&r.recipient===me.user_id&&r.status==='pending');if(!request)return;
 const d=modal('Chat request',`<p>${memberLabel(request.sender)} <span>has sent you a chat request</span></p>`,[['Approve',async()=>{await chatAction(request.sender,'approve');render();}],['Decline',async()=>{await chatAction(request.sender,'revoke');render();}]],{cancel:'Later',className:'portal-requests-dialog'});
 $('#chat-request-toast')?.remove();
 try{await markChatRequestsSeen([request]);}catch(error){d.querySelector('.modal-error').textContent=error.message;}
}
function scheduleLiveRefresh() {
 if(liveTimer)return;
 liveTimer=setTimeout(()=>{liveTimer=null;refreshLivePortal().catch(error=>status('Refresh failed: '+error.message,true));},120);
}
async function refreshLivePortal() {
 if(!me||document.hidden)return;
 if(busy||document.querySelector('dialog[open]')){if(!liveTimer)liveTimer=setTimeout(()=>{liveTimer=null;scheduleLiveRefresh();},800);return;}
 if(liveRefreshing){liveAgain=true;return;}
 liveRefreshing=true;
 try {
  const {user}=await result(db.auth.getUser());
  if(!user){clearInterval(timer);location.href=demo?'/portal-preview/':'/login/';return;}
  await load({indicators:false});
  if(view==='Contact'&&!root.hidden){contactList();if(person)await openChat(person,{preserveComposer:true});}
  const listType=$('#portal-panel')?.dataset.listType;
  if(!root.hidden&&view==='Task'&&listType==='tasks')taskList();
  if(!root.hidden&&view==='Notification'&&listType==='notifications')notificationList();
  updateIndicators();showChatRequestToast();
 } finally {liveRefreshing=false;if(liveAgain){liveAgain=false;scheduleLiveRefresh();}}
}
function startLiveUpdates() {
 if(db.channel)liveChannel=db.channel('copku-portal-live-'+me.user_id).on('postgres_changes',{event:'*',schema:'public',table:'portal_chat_requests'},scheduleLiveRefresh).on('postgres_changes',{event:'INSERT',schema:'public',table:'portal_chats'},scheduleLiveRefresh).subscribe();
 window.addEventListener('focus',scheduleLiveRefresh);
 window.addEventListener('blur',updateIndicators);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleLiveRefresh();});
 window.addEventListener('copku-demo-change',scheduleLiveRefresh);
 window.addEventListener('pagehide',()=>{if(liveChannel&&db.removeChannel)db.removeChannel(liveChannel);clearTimeout(liveTimer);},{once:true});
 timer=setInterval(()=>refreshLivePortal().catch(error=>status('Refresh failed: '+error.message,true)),15000);
 showChatRequestToast();
}
window.addEventListener('copku-language-change',()=>{document.querySelectorAll('[data-probationary-tag]').forEach(tag=>tag.textContent=window.COPKU_I18N?.translate('Probationary')||'Probationary');});
function renderNoticeDock() {
 let dock=$('#portal-notice-dock');
 if(view!=='Notification'){dock?.remove();return;}
 if(!dock){dock=document.createElement('details');dock.id='portal-notice-dock';dock.className='portal-notice-dock';root.append(dock);dock.ontoggle=()=>{noticeOpen=dock.open;};}
 const escapeTitle=id=>e(notifications.find(n=>n.id===id)?.subject||'a notification');
 dock.innerHTML=`<summary>You have ${replyNotices.length} notices</summary><div class="portal-notice-list">${replyNotices.map(n=>`<button type="button" data-notice="${n.notification_id}" data-notice-reply="${n.reply_id}"><span>${memberLabel(n.replier)} has replied to you in <strong data-user-content>${escapeTitle(n.notification_id)}</strong></span><small>${fmt(n.created_at)}</small></button>`).join('')||'<p>No unread reply notices.</p>'}</div>`;
 dock.open=noticeOpen;
 dock.querySelectorAll('[data-notice]').forEach(b=>b.onclick=()=>run(async()=>{view='Notification';tab='New notifications';render();await notificationDetail(b.dataset.notice,{replyId:b.dataset.noticeReply});}));
}
function personalPage() {
 const fields=[['Name',me.full_name],['Username',me.username],['Email',me.email],['Department',me.department],['Occupation type',me.occupation_type],['Instrument',me.instrument||'None'],['Classification',titleCase(me.classification)],['Rank',me.rank],['Status',titleCase(me.member_status)]];
 $('#portal-view').innerHTML=tabs(['Personal page'],'Personal page')+`<div class="personal-page"><h1>Personal page</h1><p class="portal-detail-meta">Your personnel information is maintained by the administrator.</p><dl class="personal-fields">${fields.map(([label,value])=>`<div><dt>${label}</dt><dd ${['Username','Email'].includes(label)?'data-user-content':''}>${label==='Name'?memberLabel(me.user_id):e(value||'Not assigned')}</dd></div>`).join('')}</dl>${me.activation_required?`<section class="activation-panel"><h2><span class="urgent">!</span>Activate your account</h2><p>Choose your own password to finish activation. No administrator approval is required.</p>${passwordForm('activation-form','Activate account')}</section>`:''}</div>`;
 if(me.activation_required)bindPasswordForm($('#activation-form'));
}
function passwordForm(id,label) {return `<form id="${id}" class="portal-password-form"><label>New password<input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><label>Confirm password<input name="confirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><button>${label}</button></form>`;}
function bindPasswordForm(form) {
 form.onsubmit=ev=>{ev.preventDefault();run(async()=>{const fd=new FormData(form);if(fd.get('password')!==fd.get('confirm'))throw Error('Passwords do not match.');const activating=me.activation_required;await result(db.auth.updateUser({password:fd.get('password')}));await load();render();status(demo ? (activating?'Sample account activated. No real password was changed.':'Demo: no real password was changed.') : (activating?'Account activated. Your activation task is complete.':'Password changed.'));});};
}
const systemTaskButtonLabel=action=>({club_approval:'Review registration',orchestra_application:'Review application',password_activation:'Activate account'}[action]||'Review task');
function openSystemTask(t) {
 if(t.system_action==='club_approval'){view='Application';applicationTab='Club approvals';clubFilter='pending';clubOffset=0;render();}
 else if(t.system_action==='orchestra_application'){view='Application';applicationTab='Orchestra applications';render();orchestraApplicationDetail(t.system_target);}
 else if(t.system_action==='password_activation'){view='Personal page';render();$('#activation-form input')?.focus();}
}

function matches(...values) { return values.join(' ').toLowerCase().includes(query); }
function actionButton(id, action) {
  const icon = action === 'accept' ? '<path d="M4 16 13 25 28 4"/>' : '<path d="M4 4 28 28M28 4 4 28"/>';
  return `<button type="button" class="action-icon ${action}" data-action="${action}" data-id="${id}" aria-label="${action === 'accept' ? 'Accept task' : 'Decline task'}"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">${icon}</svg></button>`;
}
function taskRepeatMarkup(task, controls=false) {
  if(!task.recurrence_id)return '';
  const series=taskSeries.find(s=>s.id===task.recurrence_id);
  return `<div class="task-repeat-note"><span>${e(recurrenceLabel(series))}</span>${series&&!series.active?' · <span>Repeating stopped</span>':''}${controls&&series?.active?`<button type="button" class="row-button" data-stop-series="${e(series.id)}">Stop repeating</button>`:''}</div>`;
}
function bindRecurrenceStops() {
  $$('[data-stop-series]').forEach(button=>button.onclick=()=>modal('Stop repeating','<p>Stop creating future occurrences? Existing tasks keep their current status.</p>',[['Stop repeating',async()=>{await rpc('portal_stop_task_series',{p_series:button.dataset.stopSeries});await load();render();status('Future occurrences stopped.');}]]));
}
function taskList() {
  $('#portal-panel').dataset.listType='tasks';
  const sent = tab === 'Sent tasks';
  const list = tasks.filter(t => {
    const r = receipts.find(x => x.task_id === t.id && x.user_id === me.user_id);
    const inTab = sent ? t.sender === me.user_id : !t.withdrawn && r && (
      tab === 'New tasks' ? ['unseen', 'seen'].includes(r.status) :
        tab === 'Outstanding tasks' ? r.status === 'outstanding' : (completedFilter === 'all' ? ['completed','declined'].includes(r.status) : r.status === completedFilter)
    );
    return matches(t.title, t.kind, t.body?.text) && inTab;
  });
  const pager=portalPager('tasks:'+tab), shown=pager.slice(list);
  $('#portal-panel').innerHTML = `<h1 class="portal-vh">${e(tab)}</h1>${tab === 'Completed tasks' ? `<label class="completed-filter">Show <select id="completed-filter"><option value="all"${completedFilter === 'all' ? ' selected' : ''}>All finished tasks</option><option value="completed"${completedFilter === 'completed' ? ' selected' : ''}>Completed</option><option value="declined"${completedFilter === 'declined' ? ' selected' : ''}>Declined</option></select></label>` : ''}<div class="portal-table-wrap"><table class="portal-table task-table"><thead><tr><th class="title-cell">Title</th><th>Task type</th><th>Mandatory</th><th>Duration</th><th>countdown</th><th>Status / Action</th></tr></thead><tbody>${shown.map(t => {
    const r = receipts.find(x => x.task_id === t.id && x.user_id === me.user_id);
    const protectedTask = Boolean(t.system_action);
    const action = protectedTask && r && !['completed','declined'].includes(r.status) ? `<button type="button" class="row-button" data-system-task="${t.id}">${systemTaskButtonLabel(t.system_action)}</button>` : sent ? `<button type="button" class="row-button" data-review="${t.id}">Review</button>${!t.withdrawn && !protectedTask ? `<button type="button" class="row-button" data-action="withdraw" data-id="${t.id}">Withdraw</button>` : ''}` :
      r.status === 'outstanding' ? `<button type="button" class="row-button" data-action="complete" data-id="${t.id}">Complete</button>` :
        ['unseen', 'seen'].includes(r.status) ? actionButton(t.id, 'accept') + actionButton(t.id, 'decline') : e(titleCase(r.status));
    return `<tr><td class="title-cell"><button class="task-title" data-user-content data-task="${t.id}">${r?.urgent ? '<span class="urgent" aria-label="Urgent">!</span>' : ''}${e(t.title)}</button>${taskRepeatMarkup(t,sent)}</td><td>${e(kindLabel(t.kind))}</td><td>${r ? r.mandatory ? 'Mandatory' : 'Optional' : '—'}</td><td class="duration-cell">${fmt(t.starts_at)}<br>${fmt(t.ends_at)}</td><td>${t.withdrawn ? 'Withdrawn' : countdown(t.ends_at)}</td><td class="actions-cell">${action}</td></tr>`;
  }).join('') || '<tr><td class="portal-empty" colspan="6">No tasks here.</td></tr>'}</tbody></table></div>${pager.html(list.length)}`;
  pager.bind($('#portal-panel'),taskList); bindRecurrenceStops();
  $$('[data-system-task]').forEach(b=>b.onclick=()=>openSystemTask(tasks.find(t=>t.id===b.dataset.systemTask)));
  if ($('#completed-filter')) $('#completed-filter').onchange = ev => { completedFilter = ev.target.value; pager.reset(); taskList(); };
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
function scorePreviewButton(path, label, bucket) {
  if (!path || !/\.mscz$/i.test(String(label || path).trim())) return '';
  return `<button type="button" class="portal-score-preview-button" data-score-preview data-score-path="${e(path)}" data-score-name="${e(label || 'score.mscz')}" data-score-bucket="${e(bucket)}">Preview</button>`;
}
function bindScorePreviews() {
  $$('[data-score-preview]').forEach(button => button.onclick = async () => {
    button.disabled = true;
    try {
      const { openScorePreview } = await import('./score-preview/preview.mjs?v=1.37');
      const { scoreBucket: bucket, scorePath: path, scoreName: name } = button.dataset;
      if (!['portal-files', 'portal-notification-files'].includes(bucket)) throw Error('Attachment unavailable.');
      openScorePreview({ name, opener: button, fetchScore: async signal => {
        const signed = await result(db.storage.from(bucket).createSignedUrl(path, 300));
        return fetch(signed.signedUrl, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      }});
    } catch (error) { status(error.message || 'The score preview is unavailable.', true); }
    finally { button.disabled = false; }
  });
}
async function attachment(path, label, bucket = 'portal-files', scorePreview = false) {
  if (!path) return '';
  const d = await result(db.storage.from(bucket).createSignedUrl(path, 300));
  const link = `<a class="portal-attachment" data-user-content href="${e(d.signedUrl)}" target="_blank" rel="noopener">${e(label || 'Download attachment')}</a>`;
  const preview = scorePreview ? scorePreviewButton(path, label, bucket) : '';
  return preview ? `<div class="score-file">${link}${preview}</div>` : link;
}
async function taskDetail(id) {
  delete $('#portal-panel').dataset.listType;
  const t = await result(db.from('portal_tasks').select('*').eq('id', id).single());
  const r = receipts.find(x => x.task_id === id && x.user_id === me.user_id);
  if (r?.status === 'unseen') { await rpc('portal_task_action', { p_task: id, p_action: 'seen' }); r.status = 'seen'; }
  const body = t.body || {};
  const colour = /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : '#000000';
  const highlight = /^#[0-9a-f]{6}$/i.test(body.highlight) ? body.highlight : '#ffffff';
  const size = Math.max(12, Math.min(48, Number(body.size) || 24));
  const decorations = [body.underline ? 'underline' : '', body.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
  $('#portal-panel').className = 'portal-panel portal-detail';
  $('#portal-panel').innerHTML = `<button type="button" class="plain-button" id="back">Back</button><h1 data-user-content>${e(t.title)}</h1><p class="portal-detail-meta">${e(kindLabel(t.kind))} · ${fmt(t.starts_at)} — ${fmt(t.ends_at)} · From ${memberLabel(t.sender)}</p><p class="portal-detail-meta">UUID ${e(id)}</p><div class="portal-rich" data-user-content style="color:${colour};font-size:${size}px;font-weight:${body.bold ? 'bold' : 'normal'};font-style:${body.italic ? 'italic' : 'normal'};text-decoration:${decorations}"><span style="background-color:${highlight}">${e(body.text)}</span></div>${await attachment(body.attachment_path, body.attachment_name, 'portal-files', true)}<p>${t.withdrawn ? 'Withdrawn' : r ? e(r.status) : 'Sent task'}</p><div id="detail-actions"></div>`;
  bindScorePreviews();
  $('#back').onclick = () => run(async () => { await load(); render(); });
  if (t.system_action && r && !['completed','declined'].includes(r.status)) { const b=document.createElement('button');b.className='plain-button';b.textContent=systemTaskButtonLabel(t.system_action);b.onclick=()=>openSystemTask(t);$('#detail-actions').append(b); }
  if (!t.system_action && r && !t.withdrawn) for (const action of ['unseen', 'seen'].includes(r.status) ? ['accept', 'decline'] : r.status === 'outstanding' ? ['complete'] : []) {
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
    const group = member.department || member.group_name || 'Orchestra';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(member);
  }
  return [...groups];
}
function bindTaskRecipientControls(filters) {
 const rows=$$('[data-recipient]'),groups=$$('[data-send-group]');
 const visible=()=>rows.filter(row=>!row.hidden);
 const field=(row,key)=>row.querySelector('.recipient-'+key);
 const headerState=(header,inputs)=>{const selected=inputs.filter(input=>input.checked).length;header.checked=inputs.length>0&&selected===inputs.length;header.indeterminate=selected>0&&selected<inputs.length;header.disabled=!inputs.length;};
 function refreshSummary() {
  const shown=visible(),selected=rows.filter(row=>field(row,'select').checked);
  $('#recipient-selected-count').textContent=String(selected.length);
  $('#recipient-hidden-count').textContent=String(selected.filter(row=>row.hidden).length);
  $('#task-filter-count').textContent=`${shown.length} / ${rows.length}`;
  headerState($('#send-all'),shown.map(row=>field(row,'select')));
  groups.forEach(group=>{const list=shown.filter(row=>row.dataset.group===group.dataset.sendGroup);group.closest('tr').hidden=!list.length;headerState(group,list.map(row=>field(row,'select')));});
  $$('[data-all-requirement]').forEach(header=>headerState(header,shown.map(row=>field(row,header.dataset.allRequirement))));
  headerState($('#all-urgent'),shown.map(row=>field(row,'urgent')));
 }
 function applyFilters() {const ids=new Set(filterMembers(members,filters).map(member=>member.user_id));rows.forEach(row=>row.hidden=!ids.has(row.dataset.recipient));refreshSummary();}
 $('#send-all').onchange=event=>{visible().forEach(row=>field(row,'select').checked=event.target.checked);refreshSummary();};
 groups.forEach(group=>group.onchange=()=>{visible().filter(row=>row.dataset.group===group.dataset.sendGroup).forEach(row=>field(row,'select').checked=group.checked);refreshSummary();});
 rows.forEach(row=>{
  field(row,'select').onchange=refreshSummary;field(row,'urgent').onchange=refreshSummary;
  for(const key of ['mandatory','optional'])field(row,key).onchange=()=>{if(field(row,key).checked)field(row,key==='mandatory'?'optional':'mandatory').checked=false;refreshSummary();};
 });
 $$('[data-all-requirement]').forEach(header=>header.onchange=()=>{const key=header.dataset.allRequirement;visible().forEach(row=>{field(row,key).checked=header.checked;if(header.checked)field(row,key==='mandatory'?'optional':'mandatory').checked=false;});refreshSummary();});
 $('#all-urgent').onchange=event=>{visible().forEach(row=>field(row,'urgent').checked=event.target.checked);refreshSummary();};
 $('#clear-recipient-selection').onclick=()=>{rows.forEach(row=>field(row,'select').checked=false);refreshSummary();};
 applyFilters();return {applyFilters};
}
function taskForm() {
  const recurrenceRequestId=crypto.randomUUID();
  const groups=memberGroups(members),recipientFilters=Object.fromEntries(MEMBER_FILTER_FIELDS.map(key=>[key,[]]));
  const recipientRows=groups.map(([group,list],index)=>`<tr class="group-row"><td colspan="9"><label>${e(group)} <input type="checkbox" data-send-group="${index}" aria-label="${e('Select shown members in '+group)}"></label></td></tr>${list.map(m=>`<tr data-recipient="${m.user_id}" data-group="${index}"><td><input type="checkbox" class="recipient-select" aria-label="${e('Send to '+(m.full_name||m.email))}"></td><td data-user-content>${e(m.username||m.display_id||'Not assigned')}</td><td>${memberLabel(m.user_id)}</td><td>${e(m.instrument||'—')}</td><td>${e(m.rank||'Not assigned')}</td><td>${e(titleCase(m.member_status))}</td><td><input type="checkbox" class="recipient-mandatory" checked aria-label="${e('Mandatory for '+(m.full_name||m.email))}"></td><td><input type="checkbox" class="recipient-optional" aria-label="${e('Optional for '+(m.full_name||m.email))}"></td><td><input type="checkbox" class="recipient-urgent" aria-label="${e('Urgent for '+(m.full_name||m.email))}"></td></tr>`).join('')}`).join('');
  $('#portal-panel').innerHTML = `<h1 class="portal-vh">Initiate new task</h1><form id="task-form"><div class="task-meta-row"><label for="task-title">Task title</label><input id="task-title" name="title" maxlength="200" required></div><div class="task-meta-row"><label for="task-kind">Task type</label><select id="task-kind" name="kind"><option value="rehearsal">Rehearsal</option><option value="workload">Workload</option><option value="information">Information</option></select></div><div class="task-meta-row task-duration"><span class="duration-label">Task duration</span><label for="task-start">Start</label><input id="task-start" name="startDate" type="date" required><input name="startTime" type="time" step="60" aria-label="Start time" title="Choose the hour and minute. Default: 00:00"><label for="task-end">End</label><input id="task-end" name="endDate" type="date" required><input name="endTime" type="time" step="60" aria-label="End time" title="Choose the hour and minute. Empty means the end of the selected day"></div><fieldset class="task-repeat-fields"><legend>Recurring reminder</legend><label>Repeat<select name="repeat_mode" id="task-repeat-mode"><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="hours">Every number of hours</option><option value="days">Every number of days</option></select></label><label id="task-repeat-every-label" hidden>Interval<input name="repeat_every" id="task-repeat-every" type="number" min="1" max="8760" step="1" value="1" disabled></label><p>Each occurrence keeps this duration, content, attachment and recipient settings. Stop future occurrences from Sent tasks.</p></fieldset><label for="task-body" class="compose-label">Content</label><div class="compose-toolbar"><input name="size" type="number" value="24" min="12" max="48" aria-label="Font size">${[['bold', '<b>B</b>'], ['italic', '<i>I</i>'], ['underline', '<u>U</u>'], ['strike', '<s>S</s>']].map(([key, label]) => `<label class="format-tool"><input type="checkbox" name="${key}" aria-label="${key}"><span>${label}</span></label>`).join('')}<label class="format-highlight"><span class="portal-vh">Text highlight color</span><input name="highlight" type="color" value="#ffffff" aria-label="Text highlight color"></label><label class="format-colour"><span style="color:#ef1d32">A</span><input name="color" type="color" value="#000000" aria-label="Text color"></label><label for="task-attachment" class="task-attachment-label">Attachment</label><input id="task-attachment" type="file" name="attachment" class="portal-vh"></div><textarea class="task-editor" id="task-body" name="body" required></textarea><output class="attachment-caption" id="task-file-name"></output><h2 class="recipients-heading">Send to members</h2>${accountFilterBar(recipientFilters,'task')}<p class="recipient-selection-summary"><span>Selected:</span> <output id="recipient-selected-count">0</output><span>Hidden selections:</span> <output id="recipient-hidden-count">0</output><button type="button" id="clear-recipient-selection">Clear selection</button></p><div class="portal-table-wrap"><table class="recipient-table task-recipients-table"><colgroup><col style="width:5%"><col style="width:12%"><col style="width:20%"><col style="width:12%"><col style="width:19%"><col style="width:10%"><col style="width:8%"><col style="width:8%"><col style="width:6%"></colgroup><thead><tr><th><label>Select shown<input type="checkbox" id="send-all"></label></th><th>ID</th><th>Name</th><th>Instrument</th><th>Rank</th><th>Status</th><th><label>Mandatory<input type="checkbox" data-all-requirement="mandatory" checked aria-label="Make all tasks mandatory"></label></th><th><label>Optional<input type="checkbox" data-all-requirement="optional" aria-label="Make all tasks optional"></label></th><th><label>Urgent<input type="checkbox" id="all-urgent" aria-label="Make all tasks urgent"></label></th></tr></thead><tbody>${recipientRows}</tbody></table></div><div class="task-submit-row"><button type="submit">Send</button></div></form>`;
  const recipientControls=bindTaskRecipientControls(recipientFilters);
  bindMemberFilterControls(recipientFilters,'task',recipientControls.applyFilters);
  const selectedFiles=bindFiles($('#task-attachment'),$('#task-file-name'));
  const form = $('#task-form');
  $('#task-repeat-mode').onchange=event=>{const mode=event.target.value,custom=['hours','days'].includes(mode);$('#task-repeat-every-label').hidden=!custom;$('#task-repeat-every').disabled=!custom;$('#task-repeat-every').required=custom;$('#task-repeat-every').max=mode==='days'?'3650':'8760';};
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
    const repeat=taskRecurrence(fd.get('repeat_mode'),fd.get('repeat_every'));
    const recipients = selected.map(r => ({ user_id: r.dataset.recipient, mandatory: r.querySelector('.recipient-mandatory').checked, urgent: r.querySelector('.recipient-urgent').checked }));
    const file = selectedFiles.files[0];
    const body = { text: fd.get('body'), size: fd.get('size'), color: fd.get('color'), highlight: fd.get('highlight'), bold: fd.has('bold'), italic: fd.has('italic'), underline: fd.has('underline'), strike: fd.has('strike') };
    if (file) { body.attachment_path = await upload(file, 'portal-files'); body.attachment_name = file.name; }
    await rpc(repeat?'portal_send_recurring_task':'portal_send_task', { p_title: fd.get('title'), p_body: body, p_kind: fd.get('kind'), p_start: dates[0], p_end: dates[1], p_recipients: recipients, ...(repeat?{p_repeat_unit:repeat.unit,p_repeat_every:repeat.every,p_request_id:recurrenceRequestId}:{}) });
    await load(); tab = 'Sent tasks'; render(); status('Task sent.');
  }); };
}
async function upload(file, bucket) {
  if (bucket === 'portal-notification-files') validateNotificationFiles([file]);
  else if (bucket === 'portal-images') validateImage(file);
  else validateNotificationFiles([file]);
  const path = `${me.user_id}/${crypto.randomUUID()}/${file.name.replace(/[^\w.\-]/g, '_')}`;
  const uploaded = await db.storage.from(bucket).upload(path, file, ['portal-notification-files','portal-resource-files'].includes(bucket) ? { contentType: isPreviewImage(file.type) ? file.type : 'application/octet-stream' } : undefined);
  if (uploaded.error) {
    if (bucket === 'portal-notification-files' && /bucket|row.level|policy/i.test(uploaded.error.message || '')) throw new Error('Notification attachment storage needs the new Orchestra SQL update: supabase/portal/03_notification_attachments.sql.');
    throw uploaded.error;
  }
  return path;
}
const canDeleteDiscussionContent=record=>Boolean(me&&(me.role==='admin'||record.author===me.user_id));
function confirmDeleteNotification(id) {
 modal('Delete notification','<p>Delete this post and all its replies?</p>',[['Delete',async()=>{await result(db.from('portal_notifications').delete().eq('id',id));await load();currentNotification=null;tab='New notifications';render();status('Post deleted.');}]]);
}
function confirmDeleteReply(id,notificationId) {
 modal('Delete reply','<p>Delete this reply? Replies to it will remain.</p>',[['Delete',async()=>{await result(db.from('portal_replies').delete().eq('id',id));await load();await notificationDetail(notificationId);status('Reply deleted.');}]]);
}
function notificationList() {
 $('#portal-panel').dataset.listType='notifications';
 currentNotification=null;
 const list=notifications.filter(n=>matches(n.subject,n.body)),pager=portalPager('notifications'),shown=pager.slice(list);
 $('#portal-panel').innerHTML=`<h1 class="portal-vh">New notifications</h1><div class="portal-table-wrap"><table class="portal-table notification-table"><thead><tr><th class="subject-cell">Subject</th><th>Author</th><th>Time</th><th class="portal-vh">Actions</th></tr></thead><tbody>${shown.map(n=>`<tr data-notification-row="${n.id}" class="notification-row ${reads.some(r=>r.notification_id===n.id)?'read':n.pinned?'pinned':''}"><td><button class="notification-title" data-user-content data-notification="${n.id}">${e(n.subject)}</button></td><td>${members.find(m=>m.user_id===n.author)?.role==='admin'?'<span class="admin-label">admin</span>':memberLabel(n.author)}</td><td>${fmt(n.created_at)}</td><td class="notification-row-actions">${me.role==='admin'?`<button type="button" class="row-button" data-pin="${n.id}">${n.pinned?'Unpin':'Stick on top'}</button>`:''}${canDeleteDiscussionContent(n)?`<button type="button" class="row-button" data-delete="${n.id}">Delete</button>`:''}</td></tr>`).join('')||'<tr><td class="portal-empty" colspan="4">No notifications.</td></tr>'}</tbody></table></div>${pager.html(list.length)}`;
 pager.bind($('#portal-panel'),notificationList);
 $$('[data-notification]').forEach(b=>b.onclick=()=>run(()=>notificationDetail(b.dataset.notification)));
 $$('[data-notification-row]').forEach(row=>row.onclick=ev=>{if(!ev.target.closest('button'))run(()=>notificationDetail(row.dataset.notificationRow));});
 $$('[data-pin]').forEach(b=>b.onclick=()=>run(async()=>{await result(db.from('portal_notifications').update({pinned:!notifications.find(n=>n.id===b.dataset.pin).pinned}).eq('id',b.dataset.pin));await load();render();}));
 $$('[data-delete]').forEach(b=>b.onclick=()=>confirmDeleteNotification(b.dataset.delete));
}
function notificationForm() {
 currentNotification=null;
 $('#portal-panel').innerHTML='<h1 class="portal-vh">Post a notification</h1><form id="notification-form" class="notification-form"><label>Subject<input name="subject" required maxlength="200"></label><label>Content<textarea name="body" required></textarea></label><label>Attachments — up to 10 MB each, up to eight files<input type="file" name="attachments" multiple></label><output id="notification-files" class="attachment-caption selected-files"></output><button class="plain-button">Post</button></form>';
 const files=bindFiles($('#notification-form input[type="file"]'),$('#notification-files'),true);
 $('#notification-form').onsubmit=ev=>{ev.preventDefault();run(async()=>{
  const fd=new FormData(ev.target),attachments=[];
  for(const file of validateNotificationFiles(files.files))attachments.push({path:await upload(file,'portal-notification-files'),name:file.name,type:file.type||'application/octet-stream',size:file.size});
  await result(db.from('portal_notifications').insert({author:me.user_id,subject:fd.get('subject'),body:fd.get('body'),attachments}));
  await load();tab='New notifications';render();
 });};
}

async function notificationDetail(id, {replyId, lastPage=false}={}) {
 delete $('#portal-panel').dataset.listType;
 const n=await result(db.from('portal_notifications').select('*').eq('id',id).single());
 const replies=await readAllRows(()=>db.from('portal_replies').select('*').eq('notification_id',id).order('created_at').order('id'));
 const pager=portalPager('replies:'+id);
 if(lastPage)pager.setPage(Math.floor(Math.max(0,replies.length-1)/pager.size));
 if(replyId){const index=replies.findIndex(r=>r.id===replyId);if(index>=0)pager.setPage(Math.floor(index/pager.size));}
 const shown=pager.slice(replies);
 if(view!=='Notification')return;
 currentNotification=id;
 if(!reads.some(r=>r.notification_id===id)){await result(db.from('portal_notification_reads').insert({notification_id:id,user_id:me.user_id}));reads.push({notification_id:id,user_id:me.user_id});}
 let image='';if(n.image_path){const d=await result(db.storage.from('portal-images').createSignedUrl(n.image_path,300));image=`<img src="${e(d.signedUrl)}" alt="Notification image">`;}
 const files=await Promise.all((n.attachments||[]).map(async file=>{const signed=await result(db.storage.from('portal-notification-files').createSignedUrl(file.path,300,{download:file.name}));let preview='';if(isPreviewImage(file.type)){const img=await result(db.storage.from('portal-notification-files').createSignedUrl(file.path,300));preview=`<img src="${e(img.signedUrl)}" alt="${e(file.name)}">`;}return `<div class="notification-attachment">${preview}<a class="portal-attachment" data-user-content href="${e(signed.signedUrl)}" download="${e(file.name)}" target="_blank" rel="noopener">${e(file.name)} (${(file.size/1024).toFixed(0)} KB)</a>${scorePreviewButton(file.path,file.name,'portal-notification-files')}</div>`;}));
 if(view!=='Notification'||currentNotification!==id)return;
 $('#portal-panel').className='portal-panel portal-detail';
 $('#portal-panel').innerHTML=`<div class="discussion-detail-actions"><button id="back" type="button" class="plain-button">Back</button>${canDeleteDiscussionContent(n)?`<button type="button" class="plain-button" id="delete-discussion-post">Delete post</button>`:''}</div><h1 data-user-content>${e(n.subject)}</h1><p class="portal-detail-meta">${memberLabel(n.author)} · ${fmt(n.created_at)}</p><div class="portal-rich" data-user-content>${e(n.body)}</div>${image}<div class="notification-attachments">${files.join('')}</div><h2>Replies</h2><div class="notification-replies">${shown.map(r=>`<article class="notification-reply" id="reply-${r.id}"><p class="portal-detail-meta">${memberLabel(r.author)}${r.parent_reply_id?` → ${name(replies.find(p=>p.id===r.parent_reply_id)?.author)}`:''} · ${fmt(r.created_at)}</p>${r.parent_reply_id?`<blockquote data-user-content>${e(replies.find(p=>p.id===r.parent_reply_id)?.body?.slice(0,200)||'Earlier reply')}</blockquote>`:''}<div class="portal-rich" data-user-content>${e(r.body)}</div><div class="discussion-reply-actions"><button type="button" class="plain-button reply-target" data-reply-to="${r.id}">Reply to ${memberLabel(r.author)}</button>${canDeleteDiscussionContent(r)?`<button type="button" class="plain-button delete-reply" data-delete-reply="${r.id}">Delete reply</button>`:''}</div></article>`).join('')||'<p>No replies yet.</p>'}</div>${pager.html(replies.length)}<form id="reply-form"><p id="reply-target-label">Reply to the notification</p><button id="cancel-reply-target" type="button" class="plain-button" hidden>Cancel reply target</button><label>Reply<textarea name="body" required maxlength="10000"></textarea></label><button class="plain-button">Reply</button></form>`;
 bindScorePreviews();
 pager.bind($('#portal-panel'),()=>run(()=>notificationDetail(id)));
 if($('#delete-discussion-post'))$('#delete-discussion-post').onclick=()=>confirmDeleteNotification(id);
 $$('[data-delete-reply]').forEach(b=>b.onclick=()=>confirmDeleteReply(b.dataset.deleteReply,id));
 let parentReply=null;
 const selectTarget=reply=>{parentReply=reply;$('#reply-target-label').textContent=reply?'Replying to '+(members.find(m=>m.user_id===reply.author)?.full_name||'member'):'Reply to the notification';$('#cancel-reply-target').hidden=!reply;$('#reply-form textarea').focus({preventScroll:true});};
 $$('[data-reply-to]').forEach(b=>b.onclick=()=>selectTarget(replies.find(r=>r.id===b.dataset.replyTo)));
 $('#cancel-reply-target').onclick=()=>selectTarget(null);
 $('#back').onclick=()=>run(async()=>{currentNotification=null;await load();render();});
 $('#reply-form').onsubmit=ev=>{ev.preventDefault();run(async()=>{await result(db.from('portal_replies').insert({notification_id:id,author:me.user_id,body:new FormData(ev.target).get('body'),parent_reply_id:parentReply?.id||null}));await notificationDetail(id,{lastPage:true});});};
 const visible=new Set(shown.map(r=>r.id));
 const seen=replyNotices.filter(notice=>notice.notification_id===id&&visible.has(notice.reply_id));
 if(seen.length){await result(db.from('portal_reply_notices').update({read_at:new Date().toISOString()}).in('id',seen.map(n=>n.id)));const ids=new Set(seen.map(n=>n.id));replyNotices=replyNotices.filter(n=>!ids.has(n.id));}
 updateIndicators();
}

function contactList() {
 const text=contactQuery.trim().toLocaleLowerCase();
 const eligible=members.filter(m=>m.user_id!==me.user_id&&[m.full_name,m.email,m.username,m.department,m.instrument].some(v=>[String(v||''),String(window.COPKU_I18N?.translate(String(v||''))||'')].some(label=>label.toLocaleLowerCase().includes(text))));
 const contactCounts=contactUnreadCounts(unreadChats,requests,me.user_id,activeChatPerson());
 const memberButton=m=>`<button type="button" data-person="${m.user_id}" class="${person===m.user_id?'selected':''}"><span class="contact-person-label">${memberLabel(m.user_id)}</span>${badge(contactCounts.byPerson.get(m.user_id)||0)}</button>`;
 const groups=memberGroups(eligible);
 $('#chat-contact-list').innerHTML=(groups.length===1&&groups[0][0]==='Orchestra'?eligible.map(memberButton).join(''):groups.map(([group,list])=>`<details open><summary>${e(group)}</summary>${list.map(memberButton).join('')}</details>`).join(''))||'<p class="contact-empty">No contacts found.</p>';
 $$('[data-person]').forEach(b=>b.onclick=()=>run(()=>openChat(b.dataset.person)));
}
function chatView() {
 $('#portal-view').innerHTML=`<div class="chat-layout"><nav class="chat-members" aria-label="Orchestra contacts"><div class="contact-search"><label class="portal-vh" for="contact-search">Search contacts</label><input type="search" id="contact-search" placeholder="Search" value="${e(contactQuery)}" autocomplete="off" aria-controls="chat-contact-list"></div><div id="chat-contact-list"></div></nav><div class="chat-main"><div class="chat-topline"><h2 id="chat-heading">${person?memberLabel(person):'Contact'}</h2>${backgroundPicker()}</div><div id="chat-panel"><div class="portal-panel">Select a member to chat.</div></div><div class="chat-management"><button type="button" id="manage-requests">Manage chat requests</button><button type="button" id="refresh-chat">Refresh</button></div></div></div>`;
 contactList();
 $('#contact-search').oninput=ev=>{contactQuery=ev.target.value;contactList();};
 $('#manage-requests').onclick=()=>run(manageRequests);
 $('#refresh-chat').onclick=()=>run(async()=>{await load();contactList();if(person)await openChat(person,{preserveComposer:true});});
 if(!person){const approved=requests.find(r=>r.status==='approved');if(approved)person=approved.sender===me.user_id?approved.recipient:approved.sender;}
 if(person)openChat(person).catch(err=>status(err.message,true));
}
async function chatAction(other, action) { await rpc('portal_chat_action', { p_person: other, p_action: action }); await load(); }
async function manageRequests() {
 const rows=requests.map(r=>{const other=r.sender===me.user_id?r.recipient:r.sender;return `<tr><td data-user-content>${name(other)}</td><td>${r.sender===me.user_id?'Sent':'Received'}</td><td>${e(titleCase(r.status))}</td><td>${fmt(r.created_at)}</td><td><div class="table-actions">${r.status==='pending'&&r.recipient===me.user_id?`<button type="button" data-approve="${other}">Approve</button>`:''}${r.status!=='revoked'?`<button type="button" data-revoke="${other}">Revoke</button>`:'—'}</div></td></tr>`;}).join('');
 const d=modal('Manage chat requests',`<div class="portal-table-wrap"><table class="admin-table request-table"><caption class="portal-vh">Chat requests</caption><thead><tr><th>Contact</th><th>Direction</th><th>Status</th><th>Requested</th><th>Actions</th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="portal-empty">No chat requests.</td></tr>'}</tbody></table></div>`,[],{cancel:'Close',className:'portal-requests-dialog'});
 await markChatRequestsSeen(requests);
 $('#chat-request-toast')?.remove();
 d.querySelectorAll('[data-approve], [data-revoke]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await chatAction(b.dataset.approve||b.dataset.revoke,b.dataset.approve?'approve':'revoke');d.close();render();}catch(err){d.querySelector('.modal-error').textContent=err.message;b.disabled=false;}});
}
async function openChat(id, {preserveComposer=false}={}) {
 const previous=person;person=id;
 if(previous!==id)chatLimit=500;
 $('#chat-heading').innerHTML=memberLabel(id);
 $$('[data-person]').forEach(b=>b.classList.toggle('selected',b.dataset.person===id));
 const request=requests.find(r=>[r.sender,r.recipient].includes(id));
 if(!request||request.status==='revoked'){$('#chat-panel').innerHTML='<div class="portal-panel">A chat request is required before you can chat.</div>';modal('Send Chat request',`<p>You need to send a chat request to chat with ${name(id)}</p>`,[['Send',async()=>{await chatAction(id,'send');status('Chat request sent.');}]]);person=null;return;}
 if(request.status!=='approved'){$('#chat-panel').innerHTML='<div class="portal-panel">This chat request is pending. Use Manage chat requests to approve a received request.</div>';return;}
 const rows=(await result(db.from('portal_chats').select('*').eq('request_id',request.id).order('created_at',{ascending:false}).limit(chatLimit))).reverse();
 const bubbles=await Promise.all(rows.map(async m=>`<div class="chat-bubble ${m.sender===me.user_id?'mine':''}" title="${name(m.sender)} · ${fmt(m.created_at)}"><p data-user-content>${e(m.body)}</p>${await attachment(m.attachment_path,m.attachment_name)}</div>`));
 if(view!=='Contact'||person!==id||!$('#chat-panel'))return;
 const historyHtml=`${rows.length===chatLimit?'<button type="button" id="chat-earlier" class="plain-button">Load earlier messages</button>':''}${bubbles.join('')}`;
 const keep=preserveComposer&&previous===id&&$('#chat-form');
 const oldHistory=$('.chat-history'),nearEnd=oldHistory?oldHistory.scrollHeight-oldHistory.scrollTop-oldHistory.clientHeight<80:true,oldTop=oldHistory?.scrollTop||0;
 if(keep)oldHistory.innerHTML=historyHtml;
 else {
  $('#chat-panel').innerHTML=`<div class="chat-history" aria-label="Conversation">${historyHtml}</div><form id="chat-form"><label class="portal-vh" for="chat-body">Message</label><textarea id="chat-body" name="body" maxlength="10000" placeholder="type in here"></textarea><div class="chat-compose-actions"><output id="chat-file-name" class="attachment-caption selected-files"></output><label for="chat-attachment">Add attachment</label><input id="chat-attachment" type="file" name="attachment" class="portal-vh"><button type="submit">Send</button></div></form>`;
  const selected=bindFiles($('#chat-attachment'),$('#chat-file-name'));
  $('#chat-form').onsubmit=ev=>{ev.preventDefault();run(async()=>{const fd=new FormData(ev.target),file=selected.files[0],body=String(fd.get('body')||'').trim();if(!body&&!file)throw Error('Enter a message or attachment.');const path=file?await upload(file,'portal-files'):null;await result(db.from('portal_chats').insert({request_id:request.id,sender:me.user_id,body,attachment_path:path,attachment_name:file?file.name:null}));await openChat(id);});};
 }
 if($('#chat-earlier'))$('#chat-earlier').onclick=()=>run(async()=>{chatLimit+=500;await openChat(id,{preserveComposer:true});});
 $('#chat-panel').dataset.person=id;
 const history=$('.chat-history');history.scrollTop=!keep||nearEnd?history.scrollHeight:oldTop;
 if(!document.hidden&&!root.hidden&&(document.hasFocus?.()??true)){const incoming=rows.filter(m=>m.sender!==me.user_id).map(m=>m.id);for(let i=0;i<incoming.length;i+=500)await rpc('portal_mark_chat_read',{p_messages:incoming.slice(i,i+500)});unreadChats=await rpc('portal_chat_unread');updateIndicators();}
}

function settings() {
 $('#portal-view').innerHTML=settingsTabs()+`<div class="portal-settings-content"><h1>Settings</h1><h2>${me.activation_required?'Activate your account':'Change password'}</h2>${me.activation_required?'<p>Your first password setting activates your account without administrator approval.</p>':''}${passwordForm('password-form',me.activation_required?'Activate account':'Save password')}<h2>Change your email</h2><p>Current email: ${e(me.email)}</p><form id="email-form" class="portal-password-form"><label>New email<input name="email" type="email" maxlength="254" autocomplete="email" required></label><button>Send verification</button></form><p class="portal-detail-meta">Your email changes after you confirm the verification link. Personnel details are maintained by the administrator.</p></div>`;
 bindPasswordForm($('#password-form'));
 $('#email-form').onsubmit=ev=>{ev.preventDefault();run(async()=>{const email=String(new FormData(ev.target).get('email')).trim().toLowerCase();if(email===me.email.toLowerCase())throw Error('Enter a different email address.');await result(db.auth.updateUser({email},{emailRedirectTo:location.origin+'/portal/internal/'}));ev.target.reset();status(demo?'Demo: no verification email was sent. Your sample email is unchanged.':'Verification requested. Check your new email and, if requested, your current email. Your current email remains in use until confirmation.');});};
}
function memberFormHtml(member={},creating=false) {
 const options=(values,current,placeholder='Choose')=>`<option value="">${placeholder}</option>`+values.map(v=>`<option value="${e(v)}"${v===current?' selected':''}>${e(v)}</option>`).join('');
 return `<div class="member-form-grid"><label>Name<input name="full_name" maxlength="120" value="${e(member.full_name||'')}" required></label><label>Username<input name="username" minlength="3" maxlength="40" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,39}" value="${e(member.username||'')}" ${creating?'required':''} autocomplete="off"></label><label>Email<input name="email" type="email" maxlength="254" value="${e(member.email||'')}" required></label>${creating?'<label>Temporary password<input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label>':''}<label>Department<select name="department" ${creating?'required':''}>${options(DEPARTMENTS,member.department)}</select></label><label>Occupation type<select name="occupation_type">${options(occupationsFor(member.department),member.occupation_type)}</select></label><label>Instrument<select name="instrument">${options(instrumentsFor(member.occupation_type),member.instrument,'None')}</select></label><label>Classification<select name="classification" ${creating?'required':''}>${options(CLASSIFICATIONS,member.classification)}</select></label><label>Rank<select name="rank">${options(RANKS[member.classification]||[],member.rank)}</select></label><label>Status<select name="member_status" required>${MEMBER_STATUSES.map(v=>`<option value="${v}"${v===(member.member_status||'active')?' selected':''}>${titleCase(v)}</option>`).join('')}</select></label></div>`;
}
function bindMemberForm(form) {
 const field=n=>form.querySelector(`[name="${n}"]`);
 const fill=(input,values,placeholder='Choose')=>{input.innerHTML=`<option value="">${placeholder}</option>`+values.map(v=>`<option value="${e(v)}">${e(v)}</option>`).join('');input.required=values.length>0;input.disabled=!values.length;};
 const instrument=()=>fill(field('instrument'),instrumentsFor(field('occupation_type').value),'None');
 field('department').onchange=()=>{const values=occupationsFor(field('department').value);fill(field('occupation_type'),values);if(values.length===1)field('occupation_type').value=values[0];instrument();};
 field('occupation_type').onchange=instrument;
 field('classification').onchange=()=>{fill(field('rank'),RANKS[field('classification').value]||[]);syncRankStatus(form);};
 field('rank').onchange=()=>syncRankStatus(form);
 syncRankStatus(form);
 field('occupation_type').required=Boolean(field('department').value);field('instrument').required=instrumentsFor(field('occupation_type').value).length>0;field('rank').required=Boolean(field('classification').value);
}
function syncRankStatus(form) {const rank=form.querySelector('[name="rank"]'),status=form.querySelector('[name="member_status"]');if(!status)return;const locked=isTrainingRank(rank?.value);if(locked)status.value='probationary';status.disabled=locked;status.title=locked?'Trainee and Cadet must be probationary.':'';}
const memberColumns=[['full_name','Name'],['username','Username'],['email','Email'],['department','Department'],['occupation_type','Occupation'],['instrument','Instrument'],['classification','Classification'],['rank','Rank'],['member_status','Status']];
function memberFilterChoices(key) {
 const values={department:DEPARTMENTS,occupation_type:[...new Set(DEPARTMENTS.flatMap(occupationsFor))],instrument:[...new Set(DEPARTMENTS.flatMap(occupationsFor).flatMap(instrumentsFor))],classification:CLASSIFICATIONS,rank:Object.values(RANKS).flat(),member_status:MEMBER_STATUSES};
 return ['',...values[key]];
}
function accountFilterBar(filters=accountFilters,scope='member') {
 const labels={department:'Department',occupation_type:'Occupation',instrument:'Instrument',classification:'Classification',rank:'Rank',member_status:'Status'};
 return `<div class="member-filter-row" aria-label="Filter members">${MEMBER_FILTER_FIELDS.map(key=>`<details class="member-filter"><summary><span>${labels[key]}</span><small data-filter-summary="${scope}:${key}">${filters[key].length||'All'}</small></summary><fieldset><legend class="portal-vh">${labels[key]}</legend>${memberFilterChoices(key).map(value=>`<label><input type="checkbox" data-member-filter="${key}" data-filter-scope="${scope}" value="${e(value)}" ${filters[key].includes(value)?'checked':''}><span>${e(value?titleCase(value):'Not assigned')}</span></label>`).join('')}</fieldset></details>`).join('')}<button type="button" id="clear-${scope}-filters">Clear filters</button></div><p class="table-help"><output id="${scope}-filter-count"></output> <span>members shown</span></p>`;
}
function bindMemberFilterControls(filters,scope,onChange) {
 const inputs=()=>$$(`[data-member-filter][data-filter-scope="${scope}"]`);
 inputs().forEach(input=>input.onchange=()=>{
  const key=input.dataset.memberFilter;
  filters[key]=input.checked?[...new Set([...filters[key],input.value])]:filters[key].filter(v=>v!==input.value);
  $(`[data-filter-summary="${scope}:${key}"]`).textContent=filters[key].length||'All';onChange();
 });
 $(`#clear-${scope}-filters`).onclick=()=>{for(const key of MEMBER_FILTER_FIELDS)filters[key]=[];inputs().forEach(input=>input.checked=false);MEMBER_FILTER_FIELDS.forEach(key=>$(`[data-filter-summary="${scope}:${key}"]`).textContent='All');onChange();};
}
function memberCell(m,key,label) {
 return `<td><button type="button" class="member-cell" data-member="${m.user_id}" data-field="${key}" aria-label="${e('Change '+label+' for '+m.full_name)}">${key==='full_name'?memberLabel(m.user_id):`<span ${['username','email'].includes(key)?'data-user-content':''}>${e(['classification','member_status'].includes(key)?titleCase(m[key]):m[key]||(key==='instrument'?'None':'Not assigned'))}</span>`}</button></td>`;
}
function drawMemberRows() {
 const filtered=filterMembers(members,accountFilters);
 $('#member-filter-count').textContent=`${filtered.length} / ${members.length}`;
 $('#member-directory-body').innerHTML=filtered.map(m=>`<tr>${memberColumns.map(([key,label])=>memberCell(m,key,label)).join('')}<td><div class="table-actions"><button type="button" data-reset-email="${e(m.email)}">${m.activation_required?'Activation email':'Reset email'}</button>${m.user_id!==me.user_id&&m.role==='internal'?`<button type="button" data-remove="${m.user_id}">Delete</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="10" class="portal-empty">No members match these filters.</td></tr>';
 $$('[data-field]').forEach(button=>button.onclick=()=>editMemberValue(button.dataset.member,button.dataset.field));
 $$('[data-reset-email]').forEach(b=>b.onclick=()=>run(async()=>{await result(db.auth.resetPasswordForEmail(b.dataset.resetEmail,{redirectTo:location.origin+'/portal/reset-password/'}));status('Password-setting email sent.');}));
 $$('[data-remove]').forEach(b=>b.onclick=()=>modal('Delete account',`<p>Delete <span data-user-content>${name(b.dataset.remove)}</span> and their portal records?</p>`,[['Delete',async()=>{await callService('delete-internal-user',{user_id:b.dataset.remove});await load();render();}]]));
}
function accounts() {
 $('#portal-view').innerHTML=settingsTabs()+`<div class="portal-settings-content accounts-content"><h1>Orchestra accounts</h1><form id="account-form">${memberFormHtml({},true)}<p class="portal-detail-meta">The member signs in with the temporary password and chooses their own password to activate. No approval is required for first-time activation.</p><button>Create member</button></form><h2>Members</h2>${accountFilterBar()}<p class="table-help">Click a value to edit.</p><div class="portal-table-wrap"><table class="portal-table admin-table member-directory"><caption class="portal-vh">Orchestra members</caption><colgroup><col style="width:10%"><col style="width:8%"><col style="width:16%"><col style="width:10%"><col style="width:11%"><col style="width:8%"><col style="width:8%"><col style="width:11%"><col style="width:6%"><col style="width:12%"></colgroup><thead><tr>${memberColumns.map(([,label])=>`<th scope="col">${label}</th>`).join('')}<th scope="col">Actions</th></tr></thead><tbody id="member-directory-body"></tbody></table></div></div>`;
 drawMemberRows();bindMemberForm($('#account-form'));
 bindMemberFilterControls(accountFilters,'member',drawMemberRows);
 $('#account-form').onsubmit=ev=>{ev.preventDefault();run(async()=>{const body=Object.fromEntries(new FormData(ev.target));validateMember(body,{creating:true});await callService('create-internal-user',body);await load();render();status('Member created with an urgent mandatory activation task. Give them their username/email and temporary password.');});};
}
function editMemberValue(id,key) {
 const member=members.find(m=>m.user_id===id),label=memberColumns.find(c=>c[0]===key)?.[1];
 if(!member||!label)return;
 // Dependent choices stay together, so every save is a valid personnel record.
 const keys=['department','occupation_type','instrument'].includes(key)?['department','occupation_type','instrument']:['classification','rank'].includes(key)?['classification','rank','member_status']:[key];
 const holder=document.createElement('div');holder.innerHTML=memberFormHtml(member);
 const labels=keys.map(k=>holder.querySelector(`[name="${k}"]`).closest('label').outerHTML).join('');
 const d=modal('Change '+label,`<form class="cell-edit-form"><div class="member-form-grid">${labels}</div></form>${key==='email'?'<p>Email changes made here take effect without member verification.</p>':''}`,[['Save',async dialog=>{const form=dialog.querySelector('form');if(!form.reportValidity())throw Error('Check the highlighted fields.');const update=validateMember({...member,...Object.fromEntries(new FormData(form))});try{await callService('portal-account',{action:'update_member',user_id:id,member:update});}catch(error){if(error.code==='PROFILE_PARTIAL'){await load();render();}throw error;}await load();render();status('Member updated.');}]],{className:'portal-account-dialog portal-cell-dialog'});
 const field=n=>d.querySelector(`[name="${n}"]`);
 const fill=(n,values,placeholder)=>{const input=field(n);input.innerHTML=`<option value="">${placeholder||'Choose'}</option>`+values.map(v=>`<option value="${e(v)}">${e(v)}</option>`).join('');input.required=values.length>0;};
 if(field('department'))field('department').onchange=()=>{const values=occupationsFor(field('department').value);fill('occupation_type',values);if(values.length===1)field('occupation_type').value=values[0];fill('instrument',instrumentsFor(field('occupation_type').value),'None');};
 if(field('occupation_type'))field('occupation_type').onchange=()=>fill('instrument',instrumentsFor(field('occupation_type').value),'None');
 if(field('classification'))field('classification').onchange=()=>{fill('rank',RANKS[field('classification').value]||[]);syncRankStatus(d);};
 if(field('rank'))field('rank').onchange=()=>syncRankStatus(d);
 if(key==='member_status'&&isTrainingRank(member.rank)){field('member_status').value='probationary';field('member_status').disabled=true;field('member_status').title='Trainee and Cadet must be probationary.';}else syncRankStatus(d);
 field(key)?.focus();
}

function applications() {
 if(me.role!=='admin')return;
 $('#portal-view').innerHTML=settingsTabs()+`<div class="portal-settings-content application-admin"><h1>Application</h1><div class="application-subtabs" role="tablist" aria-label="Application categories">${['Orchestra applications','Club approvals'].map(title=>`<button type="button" role="tab" aria-selected="${applicationTab===title}" data-application-tab="${title}" class="${applicationTab===title?'active':''}">${title}</button>`).join('')}</div><div id="application-content" role="tabpanel"><p role="status">Loading applications…</p></div></div>`;
 $$('[data-application-tab]').forEach(button=>button.onclick=()=>{applicationTab=button.dataset.applicationTab;render();});
 if(applicationTab==='Club approvals')clubApprovals();else orchestraApplications();
}
function applicationStatusOptions(values,current) {return values.map(value=>`<option value="${value}"${current===value?' selected':''}>${titleCase(value)}</option>`).join('');}
function applicationPager(offset,total) {return `<div class="application-pager"><button type="button" data-app-page="previous"${offset===0?' disabled':''}>Previous</button><output>${total?offset+1:0}–${Math.min(offset+50,total)} / ${total}</output><button type="button" data-app-page="next"${offset+50>=total?' disabled':''}>Next</button></div>`;}
function bindApplicationPager(kind,total) {$$('[data-app-page]').forEach(button=>button.onclick=()=>{const delta=button.dataset.appPage==='next'?50:-50;if(kind==='club'){clubOffset=Math.max(0,Math.min(clubOffset+delta,Math.max(0,total-1)));clubApprovals();}else{orchestraOffset=Math.max(0,Math.min(orchestraOffset+delta,Math.max(0,total-1)));orchestraApplications();}});}
function applicationLoadError(error,retry) {$('#application-content').innerHTML=`<p class="portal-error" role="alert">${e(error.message)}</p><button type="button" class="plain-button" id="retry-application">Retry</button>`;$('#retry-application').onclick=retry;}
function clubActions(profile) {
 const state=profile.approval_status;
 const choices=state==='pending'?[['approved','Approve'],['rejected','Reject'],['revoke','Revoke']]:state==='approved'?[['suspend','Suspend'],['revoke','Revoke']]:state==='suspended'?[['resume','Resume'],['revoke','Revoke']]:state==='rejected'?[['revoke','Revoke']]:[];
 return `<div class="table-actions">${choices.map(([action,label])=>`<button type="button" data-club="${e(profile.user_id)}" data-club-operation="${action}" ${action==='approved'&&profile.email_verified!==true?'disabled':''}>${label}</button>`).join('')||'<span>Permanent</span>'}</div>`;
}
async function clubApprovals() {
 const request=++applicationRequest;
 try {
  const data=await callService('portal-admin',{action:'list',status:clubFilter,offset:clubOffset});
  if(view!=='Application'||applicationTab!=='Club approvals'||request!==applicationRequest)return;
  const profiles=data.profiles||[],total=data.total??profiles.length;
  $('#application-content').innerHTML=`<h2>Club approvals</h2>${data.warnings?.length?`<p class="portal-error">${data.warnings.map(e).join(' ')}</p>`:''}<p class="table-help">Review registrations and manage existing members. Suspension can be resumed. Revocation is permanent.</p><div class="application-toolbar"><label>Status<select id="club-registration-filter">${applicationStatusOptions(['all','pending','approved','suspended','rejected','revoked'],clubFilter)}</select></label><button type="button" class="plain-button" id="refresh-registrations">Refresh</button></div><div class="portal-table-wrap"><table class="portal-table admin-table approvals-table club-registration-table"><caption class="portal-vh">Club registrations and past decisions</caption><thead><tr><th>Name</th><th>Email</th><th>Registered</th><th>Status</th><th>Last decision</th><th>Actions</th></tr></thead><tbody>${profiles.map(p=>`<tr><td><button type="button" class="application-person" data-club-history="${e(p.user_id)}" data-user-content>${e(p.full_name)}</button>${p.approval_status==='pending'?`<small class="application-email-state">${p.email_verified===true?'Email verified':p.email_verified===false?'Awaiting email verification':'Email verification unavailable'}</small>`:''}</td><td data-user-content>${e(p.email)}</td><td>${fmt(p.created_at)}</td><td><span class="registration-status status-${e(p.approval_status)}">${titleCase(p.approval_status)}</span></td><td>${p.registration_status_at?fmt(p.registration_status_at):'—'}</td><td>${clubActions(p)}</td></tr>`).join('')||'<tr><td colspan="6" class="portal-empty">No registrations match this status.</td></tr>'}</tbody></table></div>${applicationPager(clubOffset,total)}`;
  $('#club-registration-filter').onchange=event=>{clubFilter=event.target.value;clubOffset=0;clubApprovals();};$('#refresh-registrations').onclick=()=>clubApprovals();bindApplicationPager('club',total);
  $$('[data-club]').forEach(button=>button.onclick=()=>confirmClubAction(profiles.find(p=>p.user_id===button.dataset.club),button.dataset.clubOperation));
  $$('[data-club-history]').forEach(button=>button.onclick=()=>run(async()=>{const profile=profiles.find(p=>p.user_id===button.dataset.clubHistory);const history=await callService('portal-admin',{action:'club_registration_history',user_id:profile.user_id});modal('Registration history',`<p data-user-content>${e(profile.full_name)} · ${e(profile.email)}</p><p><span>Status</span>: <span>${titleCase(profile.approval_status)}</span></p><div class="portal-table-wrap"><table class="portal-table admin-table registration-history"><thead><tr><th>Time</th><th>Previous status</th><th>Status</th></tr></thead><tbody>${history.events.map(event=>`<tr><td>${fmt(event.created_at)}</td><td>${titleCase(event.previous_status)}</td><td>${titleCase(event.status)}</td></tr>`).join('')||'<tr><td colspan="3">No status changes have been recorded since this feature was enabled.</td></tr>'}</tbody></table></div>`,[],{cancel:'Close'});}));
 }catch(error){if(view==='Application'&&applicationTab==='Club approvals'&&request===applicationRequest)applicationLoadError(error,()=>clubApprovals());}
}
function confirmClubAction(profile,operation) {
 const label={approved:'Approve',rejected:'Reject',suspend:'Suspend',resume:'Resume',revoke:'Revoke'}[operation];
 const message={approved:'Approve this registration? Email confirmation is required for access.',rejected:'Reject this registration?',suspend:'Suspend access for this member? You can resume the same registration later.',resume:'Resume access for this suspended member?',revoke:'Permanently revoke this registration? It cannot be resumed or approved again. Registration and payment history will be kept.'}[operation];
 modal(label+' registration',`<p data-user-content>${e(profile.full_name)} · ${e(profile.email)}</p><p>${message}</p>`,[[label,async()=>{await callService('portal-admin',['approved','rejected'].includes(operation)?{action:'decide',user_id:profile.user_id,decision:operation}:{action:'manage_registration',user_id:profile.user_id,operation,expected_status:profile.approval_status});await load();render();}]]);
}
const applicationReference=number=>'OA-'+String(number).padStart(6,'0');
const applicationGroupNames={orchestra:'Orchestra',keyboard:'Keyboard',windband:'Windband',choir:'Choir'};
async function orchestraApplications() {
 const request=++applicationRequest;
 try{
  const data=await callService('portal-admin',{action:'orchestra_applications',status:orchestraFilter,offset:orchestraOffset});
  if(view!=='Application'||applicationTab!=='Orchestra applications'||request!==applicationRequest)return;
  const list=data.applications||[],total=data.total??list.length;
  $('#application-content').innerHTML=`<h2>Orchestra applications</h2><p class="table-help">Submitted forms appear here. Click an application to read all details and record a decision.</p><div class="application-toolbar"><label>Status<select id="orchestra-application-filter">${applicationStatusOptions(['all','pending','reviewing','accepted','rejected'],orchestraFilter)}</select></label><button type="button" class="plain-button" id="refresh-applications">Refresh</button><a class="plain-button" href="/opportunities/orchestra/apply/" target="_blank" rel="noopener">Open application form</a></div><div class="portal-table-wrap"><table class="portal-table admin-table orchestra-applications-table"><caption class="portal-vh">Submitted orchestra applications</caption><thead><tr><th>No.</th><th>Name</th><th>Institution</th><th>Groups</th><th>Submitted</th><th>Status</th></tr></thead><tbody>${list.map(app=>`<tr data-orchestra-application="${e(app.id)}" tabindex="0"><td><button type="button" class="application-person">${applicationReference(app.application_no)}</button></td><td data-user-content>${e(app.full_name)}</td><td data-user-content>${e(app.institution)}</td><td>${Object.entries(app.sections||{}).filter(([,section])=>section.apply).map(([key])=>`<span class="application-group-tag">${applicationGroupNames[key]||e(key)}</span>`).join(' ')}</td><td>${fmt(app.created_at)}</td><td>${titleCase(app.review_status)}</td></tr>`).join('')||'<tr><td colspan="6" class="portal-empty">No applications match this status.</td></tr>'}</tbody></table></div>${applicationPager(orchestraOffset,total)}<section class="application-email-status" aria-label="Application confirmation emails"><strong>Application confirmation emails</strong><p id="application-email-status" role="status">Loading confirmation email status…</p></section>`;
  loadApplicationEmailStatus(request);
  $('#orchestra-application-filter').onchange=event=>{orchestraFilter=event.target.value;orchestraOffset=0;orchestraApplications();};$('#refresh-applications').onclick=()=>orchestraApplications();bindApplicationPager('orchestra',total);
  $$('[data-orchestra-application]').forEach(row=>{const open=()=>orchestraApplicationDetail(row.dataset.orchestraApplication);row.onclick=open;row.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}};});
 }catch(error){if(view==='Application'&&applicationTab==='Orchestra applications'&&request===applicationRequest)applicationLoadError(error,()=>orchestraApplications());}
}
function applicationConfirmationHtml(confirmation) {
 const state=confirmation?.status||'not_requested';
 const label={queued:'Queued',sending:'Sending',sent:'Sent',failed:'Failed',uncertain:'Delivery not confirmed',not_requested:'Not requested',simulated:'Demo: no real email was sent.'}[state]||state;
 return `<section class="application-confirmation-state"><strong>Confirmation email</strong>: <span>${label}</span>${!['sent','sending','simulated'].includes(state)?'<button type="button" class="plain-button" id="retry-application-email">Retry confirmation email</button>':''}</section>`;
}
async function loadApplicationEmailStatus(request) {
 try{
  const config=await callService('portal-admin',{action:'application_email_status'});
  if(view!=='Application'||applicationTab!=='Orchestra applications'||request!==applicationRequest)return;
  const output=$('#application-email-status');if(!output)return;
  output.textContent=config.demo?'Demo: confirmation emails are simulated.':config.configured?'Confirmation emails are configured.':'Confirmation emails are awaiting setup. Applications are still saved.';
 }catch{
  if(view==='Application'&&applicationTab==='Orchestra applications'&&request===applicationRequest){const output=$('#application-email-status');if(output)output.textContent='Confirmation email status is unavailable.';}
 }
}
async function orchestraApplicationDetail(id) {
 const request=++applicationRequest;
 $('#application-content').innerHTML='<p role="status">Loading application…</p>';
 try{
  const {application:app,confirmation}=await callService('portal-admin',{action:'orchestra_application',application_id:id});
  if(view!=='Application'||applicationTab!=='Orchestra applications'||request!==applicationRequest)return;
  const yesno=value=>value?'Yes':'No';
  const item=(label,value,user=true)=>`<div><dt>${label}</dt><dd${user?' data-user-content':''}>${e(value||'—')}</dd></div>`;
  $('#application-content').innerHTML=`<button type="button" class="plain-button" id="back-applications">Back to applications</button><h2>${applicationReference(app.application_no)}</h2><dl class="application-detail-grid">${item('Name',app.full_name)}${item('Email',app.email)}${item('Tel. / WeChat',app.phone_wechat)}${item('Institution',app.institution)}${item('Gender',app.gender)}${item('Submitted',fmt(app.created_at),false)}</dl>${Object.entries(applicationGroupNames).map(([key,title])=>{const section=app.sections[key]||{apply:false};return `<section class="application-detail-section"><h3>${title} <span class="application-group-tag">${yesno(section.apply)}</span></h3>${section.apply?`<dl>${item(key==='choir'?'Voice parts':'Instrument(s)',key==='choir'?section.voice_parts.map(titleCase).join(', '):Array.isArray(section.instruments)?section.instruments.join(', '):section.instruments,key!=='choir')}${key!=='keyboard'?item('Experience',section.experience)+item('Accept reassignment?',yesno(section.accept_assignment),false):''}${item('Notes',section.notes)}</dl>`:''}</section>`;}).join('')}${applicationConfirmationHtml(confirmation)}<form id="orchestra-review-form" class="application-review-form"><label>Status<select name="status">${applicationStatusOptions(['pending','reviewing','accepted','rejected'],app.review_status)}</select></label><label>Admin notes<textarea name="admin_notes" maxlength="4000" rows="3" data-user-content>${e(app.admin_notes||'')}</textarea></label><p class="table-help">Review status records a decision. Create the member account separately when ready.</p><button type="submit">Save review</button><p class="application-review-status" role="status"></p></form>`;
  $('#back-applications').onclick=()=>orchestraApplications();
  $('#retry-application-email')?.addEventListener('click',()=>modal('Retry confirmation email','<p>The email may have already arrived if delivery was not confirmed. Retrying can send another copy.</p>',[['Retry',async()=>{await callService('portal-admin',{action:'retry_application_email',application_id:id});await orchestraApplicationDetail(id);}]]));
  $('#orchestra-review-form').onsubmit=event=>{event.preventDefault();run(async()=>{const form=event.target;if(!form.reportValidity())return;await callService('portal-admin',{action:'review_orchestra_application',application_id:id,status:form.querySelector('[name="status"]').value,admin_notes:form.querySelector('[name="admin_notes"]').value,expected_status:app.review_status,expected_reviewed_at:app.reviewed_at||null});await orchestraApplicationDetail(id);status('Application review saved.');});};
 }catch(error){if(view==='Application'&&request===applicationRequest)applicationLoadError(error,()=>orchestraApplicationDetail(id));}
}
async function shopOrders() {
 $('#portal-view').innerHTML=settingsTabs()+'<div class="portal-settings-content" id="shop-orders-content"><p>Loading orders…</p></div>';
 try {
  const data=await callService('portal-admin',{action:'shop_orders'});
  if(view!=='Shop orders')return;
  $('#shop-orders-content').innerHTML=`<div class="table-heading"><h1>Shop orders</h1><button type="button" class="plain-button" id="refresh-orders">Refresh</button></div><p class="table-help">Only paid orders without pending or full refunds are ready for delivery.</p><div class="portal-table-wrap"><table class="portal-table admin-table orders-table"><caption class="portal-vh">Shop orders and Stripe refunds</caption><thead><tr><th>Order / Date</th><th>Customer</th><th>Items</th><th>Amount</th><th>Payment</th><th>Refund</th><th>Delivery</th><th>Actions</th></tr></thead><tbody>${(data.orders||[]).map(o=>`<tr data-order-row="${o.id}" tabindex="0" aria-label="${e('Open order '+o.id)}"><td><button type="button" data-open-order="${o.id}" class="order-reference" title="${e(o.id)}" data-user-content>${e(o.id.slice(0,8))}</button><small>${fmt(o.created_at)}</small></td><td data-user-content>${e(o.customer_name||o.shipping_details?.name||'—')}<small>${e(o.customer_email||'—')}</small></td><td>${e(o.items.map(i=>`${i.id==='chopin-theme-textbook'?'Chopin theme textbook':i.id} × ${i.quantity}`).join(', '))}${o.shipping_details?`<details class="order-address"><summary>Delivery address</summary><span data-user-content>${e(Object.values(o.shipping_details.address||{}).filter(Boolean).join(', ')||JSON.stringify(o.shipping_details))}</span></details>`:''}</td><td>${money(o.amount_subtotal,o.currency)}</td><td><span class="table-state">${e(titleCase(o.payment_status))}</span></td><td>${e(({none:'No refunds',partial:'Partially refunded',refunded:'Refunded',pending:'Refund pending',failed:'Refund failed'})[o.refund_status]||'No refunds')}<small>${money(o.refunded_amount,o.currency)}${o.refund_pending_amount?` + ${money(o.refund_pending_amount,o.currency)} pending`:''}</small></td><td>${o.fulfilled_at?'Delivered':'Not delivered'}</td><td><div class="table-actions">${o.payment_status==='paid'&&!o.fulfilled_at&&!o.refund_pending_amount&&o.refund_status!=='refunded'&&!o.refund_processing?`<button type="button" data-fulfill="${o.id}">Mark delivered</button>`:''}${o.payment_status==='paid'?`<button type="button" data-refund-order="${o.id}">Refund / History</button>`:'—'}</div></td></tr>`).join('')||'<tr><td colspan="8" class="portal-empty">No shop orders yet.</td></tr>'}</tbody></table></div>`;
  $('#refresh-orders').onclick=()=>run(shopOrders);
  $$('[data-open-order]').forEach(b=>b.onclick=()=>run(()=>shopOrderDetail(b.dataset.openOrder)));
  $$('[data-order-row]').forEach(row=>{row.onclick=ev=>{if(!ev.target.closest('button,a,summary,details,input'))run(()=>shopOrderDetail(row.dataset.orderRow));};row.onkeydown=ev=>{if(ev.target===row&&['Enter',' '].includes(ev.key)){ev.preventDefault();run(()=>shopOrderDetail(row.dataset.orderRow));}};});
  $$('[data-fulfill]').forEach(b=>b.onclick=()=>modal('Mark delivered','<p>Confirm you have delivered this order to the customer.</p>',[['Confirm',async()=>{await callService('portal-admin',{action:'fulfill_order',order_id:b.dataset.fulfill});await shopOrders();}]]));
  $$('[data-refund-order]').forEach(b=>b.onclick=()=>run(()=>refundOrder(b.dataset.refundOrder)));
 } catch(err){if(view==='Shop orders')$('#shop-orders-content').innerHTML=`<h1>Shop orders</h1><p class="portal-error" role="alert">${e(err.message)}</p>`;}
}
function shippingAddressHtml(shipping) {
 if(!shipping?.address)return '<p>Delivery address not collected for this order.</p>';
 const address=shipping.address;
 const fields=[['Recipient',shipping.name],['Street address',address.line1],['Apartment / Building',address.line2],['City',address.city],['Province / State',address.state],['Postal code',address.postal_code],['Country / Region',address.country]];
 return `<dl class="order-address-fields">${fields.map(([label,value])=>`<div><dt>${label}</dt><dd data-user-content>${e(value||'—')}</dd></div>`).join('')}</dl>`;
}
async function shopOrderDetail(id) {
 const container=$('#shop-orders-content');if(!container)return;
 container.innerHTML='<p>Loading order…</p>';
 try {
  const {order:o,refunds=[]}=await callService('portal-admin',{action:'shop_order',order_id:id});
  if(view!=='Shop orders')return;
  container.innerHTML=`<div class="table-heading"><button type="button" class="plain-button" id="back-to-orders">Back to orders</button><button type="button" class="plain-button" id="refresh-order">Refresh</button></div><h1 class="order-detail-title">Order details</h1><p class="order-full-reference" data-user-content>${e(o.id)}</p><dl class="order-summary-fields"><div><dt>Created</dt><dd>${fmt(o.created_at)}</dd></div><div><dt>Customer</dt><dd data-user-content>${e(o.customer_name||o.shipping_details?.name||'—')}<br>${e(o.customer_email||'—')}</dd></div><div><dt>Payment</dt><dd>${e(titleCase(o.payment_status))}</dd></div><div><dt>Amount</dt><dd>${money(o.amount_subtotal,o.currency)}</dd></div><div><dt>Delivery</dt><dd>${o.fulfilled_at?'Delivered':'Not delivered'}${o.fulfilled_at?` · ${fmt(o.fulfilled_at)}`:''}</dd></div><div><dt>Refund</dt><dd>${money(o.refunded_amount,o.currency)}${o.refund_pending_amount?` + ${money(o.refund_pending_amount,o.currency)} pending`:''}</dd></div></dl><h2>Delivery address</h2>${shippingAddressHtml(o.shipping_details)}<h2>Items</h2><div class="portal-table-wrap"><table class="admin-table"><thead><tr><th>Item</th><th>Quantity</th></tr></thead><tbody>${o.items.map(item=>`<tr><td>${e(item.id==='chopin-theme-textbook'?'Chopin theme textbook':item.id)}</td><td>${item.quantity}</td></tr>`).join('')}</tbody></table></div><h2>Refund history</h2><div class="portal-table-wrap"><table class="admin-table"><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Stripe reference</th></tr></thead><tbody>${refunds.map(r=>`<tr><td>${fmt(r.created_at)}</td><td>${money(r.amount,o.currency)}</td><td>${e(titleCase(r.status))}</td><td data-user-content>${e(r.stripe_refund_id)}</td></tr>`).join('')||'<tr><td colspan="4">No refunds yet.</td></tr>'}</tbody></table></div><div class="order-detail-actions">${o.payment_status==='paid'&&!o.fulfilled_at&&!o.refund_pending_amount&&o.refund_status!=='refunded'&&!o.refund_processing?'<button type="button" class="plain-button" id="deliver-specific-order">Mark delivered</button>':''}${o.payment_status==='paid'?'<button type="button" class="plain-button" id="refund-specific-order">Refund / History</button>':''}</div>`;
  $('#back-to-orders').onclick=()=>run(shopOrders);$('#refresh-order').onclick=()=>run(()=>shopOrderDetail(id));
  if($('#deliver-specific-order'))$('#deliver-specific-order').onclick=()=>modal('Mark delivered','<p>Confirm you have delivered this order to the customer.</p>',[['Confirm',async()=>{await callService('portal-admin',{action:'fulfill_order',order_id:id});await shopOrderDetail(id);}]]);
  if($('#refund-specific-order'))$('#refund-specific-order').onclick=()=>run(()=>refundOrder(id,()=>shopOrderDetail(id)));
 }catch(error){if(view==='Shop orders'){container.innerHTML=`<h1>Order details</h1><p class="portal-error">${e(error.message)}</p><button type="button" class="plain-button" id="back-to-orders">Back to orders</button>`;$('#back-to-orders').onclick=()=>run(shopOrders);}}
}
async function refundOrder(orderId,afterRefund=shopOrders) {
 const data=await callService('shop-refund',{action:'review',order_id:orderId}),o=data.order,remaining=o.amount_subtotal-Number(o.refunded_amount||0)-Number(o.refund_pending_amount||0);
 const pending=data.request,requestId=pending?.request_id||crypto.randomUUID();
 const rows=(data.refunds||[]).map(r=>`<tr><td>${fmt(r.created_at)}</td><td>${money(r.amount,o.currency)}</td><td>${e(titleCase(r.status))}${r.failure_reason?`<small>${e(r.failure_reason)}</small>`:''}</td><td data-user-content>${e(r.stripe_refund_id)}</td></tr>`).join('');
 const canRefund=remaining>0&&(!pending||!pending.needs_review);
 const d=modal('Stripe refund',`<p data-user-content>${e(o.customer_name||'')} ${e(o.customer_email||'')}</p><p>Available to refund: <strong>${money(remaining,o.currency)}</strong></p><div class="portal-table-wrap"><table class="admin-table"><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Stripe reference</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No refunds yet.</td></tr>'}</tbody></table></div>${pending?.needs_review?'<p>Check this unresolved request in Stripe before issuing another refund.</p>':canRefund?`<form class="refund-form"><label>Refund amount (${e(o.currency.toUpperCase())})<input name="amount" type="number" min="0.01" max="${(remaining/100).toFixed(2)}" step="0.01" value="${((pending?.amount||remaining)/100).toFixed(2)}" required ${pending?'readonly':''}></label><label>Reason<select name="reason" ${pending?'disabled':''}><option value="requested_by_customer">Requested by customer</option><option value="duplicate">Duplicate payment</option><option value="other">Other</option></select></label></form><p>This refunds the original payment method. Confirming sends the request to Stripe.</p>`:''}`,
 canRefund?[['Confirm refund',async dialog=>{const form=dialog.querySelector('form');if(!form.reportValidity())throw Error('Check the refund amount.');const amount=Math.round(Number(form.elements.amount.value)*100),reason=pending?.reason||form.elements.reason.value;const response=await callService('shop-refund',{action:'refund',order_id:orderId,request_id:requestId,amount,reason});await afterRefund();status(response.refund?.status==='succeeded'?'Stripe refund succeeded.':'Stripe refund submitted. Its status will update from Stripe.');}]]:[],{className:'portal-refund-dialog'});
 if(pending&&d.querySelector('[name="reason"]'))d.querySelector('[name="reason"]').value=pending.reason;
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
      try { const data = await callService('portal-admin', { action: 'list' }); if (data.warnings?.length) bridgeError = data.warnings.join(' '); }
      catch (err) { bridgeError = 'Club approvals: ' + err.message; }
    }
    await load();
    view = 'Personal page';
    tab = me.role === 'admin' ? 'Initiate new task' : 'New tasks';
    render();
    if (bridgeError) status(bridgeError, true);
    // The personal page opens first; task badges retain urgent reminders.
    let idle;
    const resetIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(async () => { await db.auth.signOut(); location.href = demo ? '/portal-preview/' : '/login/'; }, 30 * 60 * 1000);
    };
    ['click', 'keydown', 'touchstart', 'scroll'].forEach(event => window.addEventListener(event, resetIdle, { passive: true }));
    resetIdle();
    startLiveUpdates();
  } catch (err) {
    root.innerHTML = `<div class="portal-layout"><aside class="portal-sidebar"><div class="portal-name"><h2>${e(me?.full_name || me?.email || 'Name')}</h2>${me ? '<button type="button" id="portal-signout" class="portal-logout">Log out</button>' : ''}</div><nav><button>Task</button><button>Notification</button><button>Contact</button><button>Settings</button><button disabled>Booking</button><button disabled>Game</button></nav></aside><section class="portal-content"><div class="portal-panel"><p class="portal-error" role="alert">${e(err.message)}</p><p>Check the Supabase setup, then refresh.</p><a href="/login/?account=orchestra">Orchestra login</a></div></section></div>`;
    if ($('#portal-signout')) $('#portal-signout').onclick = async () => { await db.auth.signOut(); location.href = '/login/?account=orchestra'; };
  }
}
const searchResults = document.querySelector('#portal-search-results');
let currentSearchResults = [];
function displaySearchResults(records) {
  currentSearchResults = records;
  root.hidden = true;
  searchResults.hidden = false;
  const sorted = sortEvents(records, !document.querySelector('#portal-oldest-first').checked);
  const heading = document.querySelector('#portal-results-heading');
  heading.innerHTML = `${records.length} <strong>${records.length === 1 ? 'Result' : 'Results'}</strong> ${records.length === 1 ? 'was' : 'were'} found`;
  const groups = document.querySelector('#portal-result-groups');
  groups.innerHTML = groupByMonth(sorted).map(group => `<section class="event-month-group"><h3>${group.key === 'undated' ? 'No date' : e(group.label)}</h3>${group.events.map(record => `<button type="button" class="portal-result-item" data-portal-result="${e(record.id)}"><strong data-user-content>${e(record.title)}</strong><span>${e(record.type)}${record.date ? ' · ' + e(record.date) : ''}</span>${record.excerpt ? `<span>${e(record.excerpt.slice(0, 220))}</span>` : ''}</button>`).join('')}</section>`).join('') || '<p class="results-empty">No tasks, notifications or members match these filters.</p>';
  groups.querySelectorAll('[data-portal-result]').forEach(button => button.onclick = () => run(async () => {
    const record = currentSearchResults.find(x => x.id === button.dataset.portalResult);
    if (!record) return;
    searchUI.close({ focus: false });
    if (record.type === 'Task') {
      view = 'Task'; tab = 'New tasks'; render(); await taskDetail(record.recordId);
    } else if (record.type === 'Notification') {
      view = 'Notification'; tab = 'New notifications'; render(); await notificationDetail(record.recordId);
    } else {
      view = 'Contact'; person = record.recordId;
      if (person === me.user_id) { view = 'Personal page'; person = null; }
      render();
    }
  }));
}
const searchUI = bindPortalSearch({
  onSearch: async filters => {
    if (!me) throw new Error('Please wait for the portal to finish loading.');
    await load();
    return searchPortal(portalSearchRecords({ tasks, notifications, members }), filters);
  },
  onClose: () => { root.hidden = false; searchResults.hidden = true; currentSearchResults = []; }
});
document.addEventListener('portal-search-results', event => {
  displaySearchResults(event.detail.records);
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.querySelector('#portal-results-heading').focus({ preventScroll: true });
});
document.querySelector('#portal-oldest-first').addEventListener('change', () => displaySearchResults(currentSearchResults));
init();
