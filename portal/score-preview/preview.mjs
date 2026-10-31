// SPDX-License-Identifier: GPL-3.0-only
import { readScoreResponse, ScorePreviewError, scoreTime } from './model.mjs';
import { createPlaybackIndex, hitNote, highlightSvg, barHighlightBox, MP3_OFFSET_MS } from './playback.mjs?v=1.49';
import {createRepeatPlayback} from './repeat-playback.mjs?v=1.49';
import {captureScoreViewport,restoreScoreViewport} from './viewport.mjs?v=1.48';
let activePreview;
const words = {
  en: { title: 'Score preview', close: 'Close score preview', loading: 'Loading score…', preparing: 'Preparing playback…', ready: 'Score ready', audioReady: 'Audio ready. Press Play in the player.', play: 'Play score', previous: 'Previous page', next: 'Next page', page: 'Page', zoom: 'Zoom', fit: 'Fit width', speed: 'Playback speed', download: 'Download original', notice: 'Player source & licences', note: 'Standard instrument sounds. Audio is prepared when you press Play.', failed: 'This score could not be previewed. You can still download the original attachment.', unavailable: 'The attachment is unavailable. Close this window and refresh the task or notification.', large: 'The score exceeds the 10 MB attachment limit.', complex: 'This compressed score is too large to preview safely.', unsupported: 'This score is damaged, empty, or uses a newer unsupported MuseScore format.', audioFailed: 'Playback could not be prepared. The score preview is still available.', timeout: 'Preparing this score took too long. Close the window and try again.', controls: 'Score pages and playback', follow: 'Follow playback', mapping: 'Preparing playback highlights…', mapped: 'The pink bar follows playback. Click a note to play from there.', mapFailed: 'Note highlighting is unavailable for this score. Preview and playback still work.', startNote: 'Play from note', mappedPartial: 'Click a note to play from there. Some notes use their written beat for timing.', mapTiming: 'The note timeline could not be matched. Score pages and audio remain available.', mapTimeout: 'Note tracking took too long. Close this score and reopen it to retry.', mapPage: 'Note tracking is unavailable on this page. Other pages and audio remain available.',barOnly:'The pink bar follows playback. Note highlighting is unavailable for this score.' },
  cn: { title: '乐谱预览', close: '关闭乐谱预览', loading: '正在载入乐谱…', preparing: '正在准备播放…', ready: '乐谱已就绪', audioReady: '音频已就绪，请点击播放器中的播放按钮。', play: '播放乐谱', previous: '上一页', next: '下一页', page: '页', zoom: '缩放', fit: '适应宽度', speed: '播放速度', download: '下载原文件', notice: '播放器源码与许可', note: '使用标准乐器音色。点击播放后准备音频。', failed: '无法预览此乐谱，仍可下载原附件。', unavailable: '无法读取附件，请关闭窗口并刷新任务或讨论。', large: '乐谱超过 10 MB 的附件大小限制。', complex: '压缩乐谱解压后过大，无法安全预览。', unsupported: '乐谱可能已损坏、没有内容，或使用了暂不支持的较新 MuseScore 格式。', audioFailed: '无法准备播放，仍可查看乐谱。', timeout: '准备乐谱用时过长，请关闭窗口后重试。', controls: '乐谱页面与播放', follow: '跟随播放翻页', mapping: '正在准备播放高亮…', mapped: '粉色高亮跟随当前小节，点击音符可从该处开始播放。', mapFailed: '此乐谱暂不支持音符高亮，仍可预览和播放。', startNote: '从此音符播放', mappedPartial: '点击音符可从该处播放。部分音符按乐谱拍点定位。', mapTiming: '无法匹配音符时间线，仍可查看乐谱和播放音频。', mapTimeout: '音符追踪准备超时，请关闭此乐谱并重新打开后重试。', mapPage: '本页暂时无法追踪音符，仍可查看其他页面和播放音频。',barOnly:'粉色高亮跟随当前小节。此乐谱暂时无法追踪音符。' }
};
export function createScoreWorkerClient(worker, { timeout = 120000 } = {}) {
  let serial = 0, closed = false; const pending = new Map();
  function failAll(code) {
    for (const value of pending.values()) { clearTimeout(value.timer); value.reject(new ScorePreviewError(code)); }
    pending.clear();
  }
  worker.onmessage = ({ data }) => {
    const entry = pending.get(data?.id); if (!entry || closed) return;
    pending.delete(data.id); clearTimeout(entry.timer);
    data.error ? entry.reject(new ScorePreviewError(data.error)) : entry.resolve(data.value);
  };
  worker.onerror = event => { event.preventDefault?.(); failAll('WORKER_FAILED'); };
  worker.onmessageerror = () => failAll('WORKER_FAILED');
  return {
    request(method, params = {}, transfer = []) {
      if (closed) return Promise.reject(new ScorePreviewError('CLOSED'));
      return new Promise((resolve, reject) => {
        const id = ++serial;
        const timer = setTimeout(() => { closed = true; worker.terminate(); failAll('TIMEOUT'); }, timeout);
        pending.set(id, { resolve, reject, timer });
        try { worker.postMessage({ id, method, ...params }, transfer); }
        catch { pending.delete(id); clearTimeout(timer); reject(new ScorePreviewError('WORKER_FAILED')); }
      });
    },
    close() { if (!closed) { closed = true; worker.terminate(); } failAll('CLOSED'); }
  };
}
export function openScorePreview({ name, fetchScore, opener, document: doc = document, makeWorker = () => new Worker(new URL('./worker.mjs?v=1.49', import.meta.url), { type: 'module' }), makeMappingWorker = () => new Worker(new URL('./mapping-worker.mjs?v=1.49', import.meta.url), { type: 'module' }) }) {
  activePreview?.close();
  const dialog = doc.createElement('dialog'); dialog.className = 'score-preview-dialog'; dialog.dataset.userContent = '';
  dialog.innerHTML = '<header class="score-preview-header"><div><p class="score-preview-eyebrow"></p><h2 id="score-preview-name"></h2><p class="score-preview-composer" hidden></p></div><button type="button" class="score-preview-close">×</button></header><section class="score-preview-controls"><button type="button" class="score-play" disabled></button><audio controls preload="metadata" hidden></audio><label class="score-speed-label" hidden><span></span><select class="score-speed"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><label class="score-follow-label" hidden><input type="checkbox" class="score-follow" checked><span></span></label><div class="score-page-tools"><button type="button" class="score-previous" disabled>‹</button><span class="score-page-count"></span><button type="button" class="score-next" disabled>›</button><label class="score-zoom-label"><span></span><select class="score-zoom"><option value="fit"></option><option value="100">100%</option><option value="125">125%</option><option value="150">150%</option><option value="200">200%</option></select></label></div></section><p class="score-preview-status" role="status" aria-live="polite"></p><p class="score-preview-error" role="alert" hidden></p><p class="score-map-status" role="status" hidden></p><div class="score-preview-stage" aria-busy="true" tabindex="0"><div class="score-paper" hidden><img class="score-page-image" alt=""><div class="score-bar-highlight" aria-hidden="true" hidden></div><img class="score-note-highlight" alt="" hidden><div class="score-note-targets"></div></div></div><footer class="score-preview-footer"><span class="score-preview-note"></span><a class="score-download" hidden></a><a class="score-source" target="_blank" rel="noopener"></a></footer>';
  const q = s => dialog.querySelector(s), audio = q('audio'), paper = q('.score-paper'), stage = q('.score-preview-stage');
  const barLayer = q('.score-bar-highlight');
  Object.assign(barLayer.style,{position:'absolute',inset:'auto',pointerEvents:'none',background:'rgba(255,128,128,.4)',mixBlendMode:'multiply',zIndex:'1',visibility:'hidden'});
  paper.style.position='relative';paper.style.isolation='isolate';q('.score-page-image').style.position='relative';q('.score-page-image').style.zIndex='0';q('.score-note-highlight').style.zIndex='2';q('.score-note-targets').style.zIndex='3';
  if(doc.head?.append&&!doc.querySelector?.('link[data-copku-score-style="1.49"]')){const link=doc.createElement('link');link.rel='stylesheet';link.href=new URL('./preview.css?v=1.49',import.meta.url).href;link.dataset.copkuScoreStyle='1.49';doc.head.append(link);}

  const abort = new AbortController(), urls = new Set(), pageCache = new Map();
  let closed = false, mappingClient, playback, geometry, overlayUrl, frameHandle, audioPromise, pendingSeek = null, mapStatus = '', mappingReadyStatus = 'mapped', highlightKey = '', followingPage = null, client, fileUrl, audioUrl, pages = 0, page = 0, duration = 0, pageSequence = 0, currentStatus = 'loading', audioPreparing = false;
  const geometryCache = new Map(), geometryRequests = new Map();
  let barHighlightKey = '',barPlayback,barGeometry,repeatPlayer;
  const pageTracking=new Map();
  let viewedPage = false, pendingViewport;
  const text = () => words[window.COPKU_I18N?.language === 'cn' ? 'cn' : 'en'];
  function refreshLabels() {
    const t = text(); dialog.setAttribute('aria-label', t.title); q('.score-preview-eyebrow').textContent = t.title;
    q('.score-preview-close').setAttribute('aria-label', t.close); q('.score-play').textContent = t.play;
    q('.score-previous').setAttribute('aria-label', t.previous); q('.score-next').setAttribute('aria-label', t.next);
    q('.score-zoom-label span').textContent = t.zoom; q('.score-zoom option[value="fit"]').textContent = t.fit;
    q('.score-speed-label span').textContent = t.speed; q('.score-download').textContent = t.download;
    q('.score-source').textContent = t.notice; q('.score-preview-note').textContent = t.note;
    q('.score-preview-controls').setAttribute('aria-label', t.controls);
    q('.score-page-count').textContent = `${t.page} ${pages ? page + 1 : '—'} / ${pages || '—'}${duration ? ' · ' + scoreTime(duration) : ''}`;
    q('.score-page-image').alt = `${String(name || '').slice(0, 250)} · ${t.page} ${page + 1}`;
    q('.score-preview-status').textContent = t[currentStatus] || '';
    q('.score-follow-label span').textContent = t.follow; q('.score-map-status').textContent = t[mapStatus] || ''; q('.score-map-status').hidden = !mapStatus;
  }
  function showError(error, audioOnly = false) {
    if (closed || error?.code === 'CLOSED' || error?.name === 'AbortError') return;
    const t = text(); const label = audioOnly ? t.audioFailed : ({ FILE_UNAVAILABLE: t.unavailable, SCORE_TOO_LARGE: t.large, SCORE_TOO_COMPLEX: t.complex, UNSUPPORTED_SCORE: t.unsupported, INVALID_SCORE: t.unsupported, TIMEOUT: t.timeout })[error?.code] || t.failed;
    q('.score-preview-error').textContent = label; q('.score-preview-error').hidden = false;
    currentStatus = ''; refreshLabels(); stage.setAttribute('aria-busy', 'false');
  }
  function objectUrl(blob) { const url = URL.createObjectURL(blob); urls.add(url); return url; }
  function cachePage(index, content, tracking=null) {
    const svg=typeof content==='string'?content:content.svg;tracking=typeof content==='object'?content.tracking:tracking;if(tracking)pageTracking.set(index,tracking);
    const url = objectUrl(new Blob([svg], { type: 'image/svg+xml' })); pageCache.set(index, url);
    while (pageCache.size > 6) { const key = pageCache.keys().next().value, old = pageCache.get(key); pageCache.delete(key);pageTracking.delete(key); URL.revokeObjectURL(old); urls.delete(old); }
    return url;
  }
  function displayPage(index, url) {
    const memory = viewedPage ? captureScoreViewport(geometry||barGeometry, viewportMetrics()) : null; viewedPage = true;
    page = index;barGeometry=pageTracking.get(index)||null; pendingViewport = memory ? {memory,index,url,sequence:pageSequence} : null;
    q('.score-page-image').src = url; paper.hidden = false;
    if (!memory) { stage.scrollTop = 0; stage.scrollLeft = 0; }
    stage.setAttribute('aria-busy', 'false'); q('.score-previous').disabled = page === 0; q('.score-next').disabled = page >= pages - 1;
    currentStatus = audioPreparing ? 'preparing' : 'ready'; refreshLabels();
    geometry = null; highlightKey = ''; clearBarHighlight(); q('.score-note-highlight').hidden = true; q('.score-note-targets').replaceChildren?.();
    if (playback&&mappingClient) void loadGeometry(index);
    updateHighlight();
    restorePendingViewport();
  }
  function viewportMetrics() {
    const p=paper.getBoundingClientRect(),s=stage.getBoundingClientRect();
    return {scrollTop:Number(stage.scrollTop)||0,scrollLeft:Number(stage.scrollLeft)||0,paperTop:p.top,paperHeight:p.height,paperWidth:p.width,viewportTop:s.top+(stage.clientTop||0),viewportHeight:stage.clientHeight||s.height,maxTop:stage.scrollHeight-stage.clientHeight,maxLeft:stage.scrollWidth-stage.clientWidth};
  }
  function restorePendingViewport(finish=false) {
    const pending=pendingViewport,image=q('.score-page-image');
    if (closed||!pending||pending.index!==page||pending.sequence!==pageSequence||pending.url!==image.src||image.complete===false) return;
    const measureId=(barPlayback||playback)?.at(Math.max(0,(Number(audio.currentTime)||0)*1000-MP3_OFFSET_MS)).measure?.layoutId;
    const position=restoreScoreViewport(pending.memory,geometry||barGeometry,viewportMetrics(),{measureId});
    stage.scrollTop=position.top;stage.scrollLeft=position.left;
    if (geometry||barGeometry||finish||!mappingClient) pendingViewport=null;
  }
  q('.score-page-image').addEventListener('load',()=>restorePendingViewport());
  // Scrolling or dragging after a page arrives takes priority over a late map.
  for (const event of ['wheel','touchmove','pointerdown']) stage.addEventListener(event,()=>{pendingViewport=null;},{passive:true});
  stage.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' '].includes(event.key))pendingViewport=null;});
  async function changePage(index) {
    if (closed || index < 0 || index >= pages) return;
    const sequence = ++pageSequence; stage.setAttribute('aria-busy', 'true'); q('.score-previous').disabled = true; q('.score-next').disabled = true;
    try { const url = pageCache.get(index) || cachePage(index, await client.request('page', { index })); if (!closed && sequence === pageSequence) displayPage(index, url); }
    catch (error) { showError(error); }
  }
  function close() { if (!closed) dialog.close(); }
  dialog.addEventListener('close', () => {
    if (closed) return; closed = true; abort.abort(); client?.close(); mappingClient?.close();repeatPlayer?.close(); cancelFrame(); audio.pause(); audio.removeAttribute('src'); audio.load();
    for (const url of urls) URL.revokeObjectURL(url); urls.clear(); pageCache.clear();pageTracking.clear(); geometryCache.clear(); geometryRequests.clear();
    window.removeEventListener('copku-language-change', refreshLabels); window.removeEventListener('pagehide', close);
    doc.documentElement.classList.remove('score-preview-open'); dialog.remove();
    if (activePreview?.dialog === dialog) activePreview = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }, { once: true });
  q('.score-preview-close').onclick = close;
  q('.score-previous').onclick = () => { if (!audio.paused) q('.score-follow').checked = false; return changePage(page - 1); }; q('.score-next').onclick = () => { if (!audio.paused) q('.score-follow').checked = false; return changePage(page + 1); };
  q('.score-zoom').onchange = event => { pendingViewport=null;const value = event.target.value; paper.style.width = value === 'fit' ? '100%' : `${Number(value)}%`; };
  q('.score-speed').onchange = event => { audio.playbackRate = Number(event.target.value); };
  function cancelFrame() { if (frameHandle != null) { (window.cancelAnimationFrame || clearTimeout)(frameHandle); frameHandle = null; } }
  function tick() { frameHandle = null; if (closed) return; updateHighlight(); if (!audio.paused && !audio.ended) frameHandle = window.requestAnimationFrame ? window.requestAnimationFrame(tick) : setTimeout(tick, 40); }
  function applySeek() { if (pendingSeek != null) { try { audio.currentTime = pendingSeek; pendingSeek = null; } catch { /* Retry after metadata. */ } } }
  async function prepareAudio() {
    if (audioUrl) return;
    if (audioPromise) return audioPromise;
    audioPreparing = true; q('.score-play').disabled = true; q('.score-preview-error').hidden = true; currentStatus = 'preparing'; refreshLabels();
    audioPromise = (async () => {
      const bytes = await client.request('audio'); if (closed) return;
      audioUrl = objectUrl(new Blob([bytes], { type: 'audio/mpeg' })); audio.src = audioUrl; audio.hidden = false; audio.setAttribute('aria-label', `${text().title}: ${String(name || '')}`);
      q('.score-play').hidden = true; q('.score-speed-label').hidden = false; currentStatus = 'audioReady'; refreshLabels();
    })();
    try { await audioPromise; } catch (error) { audioPromise = null; throw error; }
    finally { audioPreparing = false; if (!closed) q('.score-play').disabled = false; }
  }
  async function playAudio() {
    try {
      await prepareAudio(); if (closed) return; applySeek();
      try { await audio.play(); if (!closed) { currentStatus = 'ready'; refreshLabels(); } } catch { /* Native controls remain available if another tap is required. */ }
      updateHighlight();
    } catch (error) { showError(error, true); }
  }
  q('.score-play').onclick = playAudio;
  audio.addEventListener('loadedmetadata', () => { validateAudioTimeline(); applySeek(); updateHighlight(); });
  audio.addEventListener('timeupdate', updateHighlight); audio.addEventListener('seeking', updateHighlight);
  audio.addEventListener('play', () => { cancelFrame(); tick(); });
  audio.addEventListener('pause', () => { cancelFrame(); updateHighlight(); });
  audio.addEventListener('ended', () => { cancelFrame(); updateHighlight(); });
  function validateAudioTimeline() {
    if (playback && Number.isFinite(audio.duration) && audio.duration > 0 && playback.durationMs > audio.duration * 1000 + 500) disableMapping(new ScorePreviewError('NOTE_MAP_TIMING'));
  }
  function disableMapping(error) {
    if (closed) return; mappingClient?.close(); mappingClient = null; playback = null; geometry = null; geometryCache.clear();
    mapStatus = error?.code === 'TIMEOUT' ? 'mapTimeout' : error?.code === 'NOTE_MAP_TIMING' ? 'mapTiming' : (barPlayback?'barOnly':'mapFailed'); q('.score-follow-label').hidden = !barPlayback; q('.score-note-highlight').hidden = true; q('.score-note-targets').replaceChildren?.(); refreshLabels();restorePendingViewport(true);
  }
  function clearBarHighlight() {barLayer.hidden=true;barLayer.style.visibility='hidden';barHighlightKey='';}
  function installBarTimeline(info){
    if(!info?.measures?.length)return;
    barPlayback=createPlaybackIndex([],{measures:info.measures});
    repeatPlayer?.close();repeatPlayer=createRepeatPlayback(audio,info.repeatPlan||[],{offsetMs:MP3_OFFSET_MS,onJump:updateHighlight});
    q('.score-follow').checked=true;q('.score-follow-label').hidden=false;
  }
  function updateHighlight() {
    if(closed||(!playback&&!barPlayback))return;
    const time=Math.max(0,(Number(audio.currentTime)||0)*1000-MP3_OFFSET_MS);
    const frame=playback?.at(time)||{ids:[],key:'',page:null},barFrame=(barPlayback||playback).at(time),followPage=barFrame.page??frame.page;
    if(q('.score-follow').checked&&!audio.paused&&followPage!=null&&followPage!==page&&followingPage!==followPage){const target=followPage;followingPage=target;void changePage(target).finally(()=>{if(followingPage===target)followingPage=null;});}
    const bars=barGeometry?.measures?.length?barGeometry:geometry;
    const barId=barFrame.measure?.page===page?barFrame.measure.layoutId:null,bar=bars?.measures?.find(m=>m.id===barId),key=page+':'+(bar?.id??'');
    if(key!==barHighlightKey){clearBarHighlight();barHighlightKey=key;if(bar){try{const b=barHighlightBox(bars,bar.id);for(const k of ['left','top','width','height'])barLayer.style[k]=b[k]+'%';barLayer.dataset.measure=String(bar.id);barLayer.hidden=false;barLayer.style.visibility='visible';}catch{clearBarHighlight();}}}
    if(!geometry)return;
    const noteKey=page+':'+frame.key;if(noteKey===highlightKey)return;highlightKey=noteKey;
    try{
      if(overlayUrl){URL.revokeObjectURL(overlayUrl);urls.delete(overlayUrl);overlayUrl=null;}
      if(!frame.ids.length){q('.score-note-highlight').hidden=true;return;}
      overlayUrl=objectUrl(new Blob([highlightSvg(geometry,frame.ids)],{type:'image/svg+xml'}));q('.score-note-highlight').src=overlayUrl;q('.score-note-highlight').hidden=false;
    }catch(error){disableMapping(error);}
  }
  function seekNote(id) {
    if (!playback || closed) return;
    const at = playback.noteStart(id, Math.max(0, (Number(audio.currentTime) || 0) * 1000 - MP3_OFFSET_MS)); if (at == null) return;
    pendingSeek = (at + MP3_OFFSET_MS) / 1000; void playAudio();
  }
  function installGeometry(value) {
    geometry = value; mapStatus = value.warnings?.length ? 'mappedPartial' : mappingReadyStatus; refreshLabels(); highlightKey = ''; const layer = q('.score-note-targets'); layer.replaceChildren();
    const [vx, vy, width, height] = value.viewBox;
    for (const n of value.notes) {
      if (!playback.occurrences(n.id).length) continue;
      const button = doc.createElement('button'), b = n.bounds; button.type = 'button'; button.className = 'score-note-target';
      button.setAttribute('aria-label', `${text().startNote} ${n.id + 1}`); button.title = text().mapped;
      button.style.left = `${(b.x - vx - 2) / width * 100}%`; button.style.top = `${(b.y - vy - 2) / height * 100}%`;
      button.style.width = `${(b.width + 4) / width * 100}%`; button.style.height = `${(b.height + 4) / height * 100}%`;
      button.onclick = event => { event.stopPropagation(); seekNote(n.id); }; layer.append(button);
    }
    restorePendingViewport();updateHighlight();
  }
  function pageUnavailable(error) {
    if (closed) return;
    if (['CLOSED','TIMEOUT','WORKER_FAILED'].includes(error?.code)) { disableMapping(error); return; }
    geometry = null; if(!barPlayback)clearBarHighlight(); q('.score-note-highlight').hidden = true; q('.score-note-targets').replaceChildren?.(); mapStatus = 'mapPage'; refreshLabels();restorePendingViewport(true);updateHighlight();
  }
  async function loadGeometry(index) {
    try {
      let value = geometryCache.get(index);
      if (!value) {
        if (!geometryRequests.has(index)) geometryRequests.set(index, mappingClient.request('page', { index }));
        value = await geometryRequests.get(index); geometryRequests.delete(index);
        if (closed || !playback) return; geometryCache.set(index, value);
        while (geometryCache.size > 6) geometryCache.delete(geometryCache.keys().next().value);
      }
      if (!closed && playback && page === index) installGeometry(value);
    } catch (error) { geometryRequests.delete(index); if (index === page || ['CLOSED','TIMEOUT','WORKER_FAILED'].includes(error?.code)) pageUnavailable(error); }
  }
  paper.onclick = event => {
    if (!geometry || event.target?.closest?.('button')) return;
    const rect = paper.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const [x, y, w, h] = geometry.viewBox, note = hitNote(geometry, x + (event.clientX - rect.left) / rect.width * w, y + (event.clientY - rect.top) / rect.height * h);
    if (note) seekNote(note.id);
  };
  q('.score-follow').onchange = updateHighlight;
  async function startMapping(buffer) {
    try {
      mapStatus = 'mapping'; refreshLabels(); mappingClient = createScoreWorkerClient(makeMappingWorker());
      const info = await mappingClient.request('load', { buffer }, [buffer]); if (closed) return;
      if (info.pages !== pages) throw Error('NOTE_MAP_UNAVAILABLE');if(!barPlayback)installBarTimeline(info); playback = createPlaybackIndex(info.notes, { anchors: info.anchors || [], measures: info.measures || [] }); duration = info.durationMs / 1000;
      q('.score-follow-label').hidden = false; mappingReadyStatus = info.warnings?.length ? 'mappedPartial' : 'mapped'; mapStatus = mappingReadyStatus; refreshLabels(); validateAudioTimeline(); if (playback) await loadGeometry(page);
    } catch (error) { disableMapping(error); }
  }
  audio.onerror = () => { if (!closed) showError(new ScorePreviewError('AUDIO_UNAVAILABLE'), true); };
  q('#score-preview-name').textContent = String(name || 'MuseScore').slice(0, 300);
  q('.score-source').href = new URL('./licences.html', import.meta.url).href;
  window.addEventListener('copku-language-change', refreshLabels); window.addEventListener('pagehide', close, { once: true });
  doc.body.append(dialog); doc.documentElement.classList.add('score-preview-open'); refreshLabels(); dialog.showModal();
  activePreview = { close, dialog };
  (async () => {
    try {
      const response = await fetchScore(abort.signal), bytes = await readScoreResponse(response, abort.signal); if (closed) return;
      fileUrl = objectUrl(new Blob([bytes], { type: 'application/octet-stream' })); q('.score-download').href = fileUrl; q('.score-download').download = String(name || 'score.mscz'); q('.score-download').hidden = false;
      const mappingBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      client = createScoreWorkerClient(makeWorker());
      const info = await client.request('load', { buffer: bytes.buffer }, [bytes.buffer]); if (closed) return;
      pages = info.pages; duration = info.tracking?.durationMs/1000||info.duration;
      if (info.composer) { q('.score-preview-composer').textContent = info.composer; q('.score-preview-composer').hidden = false; }
      installBarTimeline(info.tracking);displayPage(0, cachePage(0, info.svg,info.tracking?.geometry)); q('.score-play').disabled = false; void startMapping(mappingBuffer);
    } catch (error) { if (!closed) { client?.close(); showError(error); } }
  })();
  return activePreview;
}
